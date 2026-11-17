from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from pymongo import DESCENDING

from ..database import get_database
from ..middleware.auth import roles_required
from .catalog import seed_catalog
from ..utils.responses import parse_object_id, serialize_value

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def _text(payload, field, limit):
    value = payload.get(field, "")
    return value.strip() if isinstance(value, str) and len(value.strip()) <= limit else None


def _not_found(resource):
    return jsonify(message=f"{resource} was not found."), 404


@admin_bp.get("/dashboard")
@roles_required("admin")
def dashboard():
    database = get_database()
    recent_students = list(
        database.users.find({"role": "student"}, {"name": 1, "email": 1, "is_active": 1, "created_at": 1})
        .sort("created_at", DESCENDING)
        .limit(5)
    )
    attempts = list(database.attempts.find({}, {"score": 1, "total_marks": 1}).limit(1000))
    scored = [
        attempt["score"] / attempt["total_marks"] * 100
        for attempt in attempts
        if isinstance(attempt.get("score"), (int, float))
        and isinstance(attempt.get("total_marks"), (int, float))
        and attempt["total_marks"] > 0
    ]
    return jsonify(
        stats={
            "students": database.users.count_documents({"role": "student"}),
            "active_students": database.users.count_documents({"role": "student", "is_active": True}),
            "materials": database.materials.count_documents({}),
            "quizzes": database.quizzes.count_documents({}),
            "tests": database.tests.count_documents({}),
            "attempts": database.attempts.count_documents({}),
            "average_score": round(sum(scored) / len(scored), 1) if scored else None,
        },
        recent_students=[serialize_value(student) for student in recent_students],
    )


@admin_bp.get("/students")
@roles_required("admin")
def students():
    items = get_database().users.find({"role": "student"}, {
        "name": 1, "email": 1, "age_group": 1, "is_active": 1, "created_at": 1,
    }).sort("created_at", DESCENDING)
    return jsonify(students=[serialize_value(item) for item in items])


@admin_bp.get("/students/<student_id>")
@roles_required("admin")
def student_details(student_id):
    user_id = parse_object_id(student_id)
    if user_id is None:
        return _not_found("Student")
    database = get_database()
    student = database.users.find_one(
        {"_id": user_id, "role": "student"},
        {"password_hash": 0},
    )
    if not student:
        return _not_found("Student")
    attempts = list(database.attempts.find({
        "user_id": user_id,
        "status": "submitted",
        "assessment_type": {"$in": ["quiz", "test"]},
    }).sort("submitted_at", DESCENDING).limit(100))
    percentages = [
        item["score"] / item["total_marks"] * 100
        for item in attempts
        if isinstance(item.get("score"), (int, float))
        and isinstance(item.get("total_marks"), (int, float))
        and item["total_marks"] > 0
    ]
    return jsonify(
        student=serialize_value(student),
        performance={
            "attempts": database.attempts.count_documents({"user_id": user_id, "status": "submitted"}),
            "quizzes_completed": database.attempts.count_documents({
                "user_id": user_id, "assessment_type": "quiz", "status": "submitted",
            }),
            "tests_completed": database.attempts.count_documents({
                "user_id": user_id, "assessment_type": "test", "status": "submitted",
            }),
            "average_score": round(sum(percentages) / len(percentages), 1) if percentages else None,
            "tests_passed": database.attempts.count_documents({
                "user_id": user_id, "assessment_type": "test", "status": "submitted", "passed": True,
            }),
        },
        recent_results=[{
            "id": str(item["_id"]),
            "title": item["assessment_title"],
            "type": item["assessment_type"],
            "score": item["score"],
            "total_marks": item["total_marks"],
            "passed": item.get("passed"),
            "submitted_at": item["submitted_at"],
        } for item in attempts[:20]],
    )


@admin_bp.patch("/students/<student_id>/status")
@roles_required("admin")
def update_student_status(student_id):
    user_id = parse_object_id(student_id)
    if user_id is None:
        return _not_found("Student")
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not isinstance(payload.get("is_active"), bool):
        return jsonify(message="is_active must be true or false."), 400
    result = get_database().users.update_one(
        {"_id": user_id, "role": "student"},
        {"$set": {"is_active": payload["is_active"], "updated_at": datetime.now(timezone.utc)}},
    )
    if not result.matched_count:
        return _not_found("Student")
    return jsonify(message="Student status updated.", is_active=payload["is_active"])


@admin_bp.get("/categories")
@roles_required("admin")
def admin_categories():
    database = get_database()
    seed_catalog(database)
    items = database.categories.find({}).sort([("parent_id", 1), ("name", 1)])
    return jsonify(categories=[serialize_value(item) for item in items])


@admin_bp.post("/categories")
@roles_required("admin")
def create_category():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    name = _text(payload, "name", 100)
    raw_description = payload.get("description", "")
    description = raw_description.strip() if isinstance(raw_description, str) and len(raw_description) <= 1000 else None
    parent_value = payload.get("parent_id")
    period_value = payload.get("period_id")
    if not name or description is None:
        return jsonify(message="A category name and a description of up to 1000 characters are required."), 400

    parent_id = parse_object_id(parent_value) if parent_value else None
    period_id = parse_object_id(period_value) if period_value else None
    if parent_value and parent_id is None:
        return jsonify(message="Choose a valid parent category."), 400
    if period_value and period_id is None:
        return jsonify(message="Choose a valid historical period."), 400

    database = get_database()
    if parent_id and not database.categories.find_one({"_id": parent_id, "is_active": True}):
        return jsonify(message="The selected parent category is unavailable."), 400
    if period_id and not database.periods.find_one({"_id": period_id, "is_active": True}):
        return jsonify(message="The selected historical period is unavailable."), 400
    if database.categories.find_one({"name": name, "parent_id": parent_id}):
        return jsonify(message="A category with this name already exists at that level."), 409

    now = datetime.now(timezone.utc)
    category = {
        "name": name, "description": description, "parent_id": parent_id,
        "period_id": period_id, "is_active": True, "created_at": now, "updated_at": now,
    }
    result = database.categories.insert_one(category)
    category["_id"] = result.inserted_id
    return jsonify(category=serialize_value(category)), 201


@admin_bp.put("/categories/<category_id>")
@roles_required("admin")
def update_category(category_id):
    object_id = parse_object_id(category_id)
    if object_id is None:
        return _not_found("Category")
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    name = _text(payload, "name", 100)
    raw_description = payload.get("description", "")
    description = raw_description.strip() if isinstance(raw_description, str) and len(raw_description) <= 1000 else None
    if not name or description is None:
        return jsonify(message="A category name and a description of up to 1000 characters are required."), 400

    database = get_database()
    category = database.categories.find_one({"_id": object_id})
    if not category:
        return _not_found("Category")
    if database.categories.find_one({
        "_id": {"$ne": object_id}, "name": name, "parent_id": category.get("parent_id"),
    }):
        return jsonify(message="A category with this name already exists at that level."), 409
    database.categories.update_one(
        {"_id": object_id},
        {"$set": {"name": name, "description": description, "updated_at": datetime.now(timezone.utc)}},
    )
    category.update({"name": name, "description": description})
    return jsonify(category=serialize_value(category))


@admin_bp.delete("/categories/<category_id>")
@roles_required("admin")
def delete_category(category_id):
    object_id = parse_object_id(category_id)
    if object_id is None:
        return _not_found("Category")
    database = get_database()
    if not database.categories.find_one({"_id": object_id}):
        return _not_found("Category")
    references = (
        ("categories", {"parent_id": object_id}),
        ("materials", {"category_id": object_id}),
        ("quizzes", {"category_id": object_id}),
        ("tests", {"category_id": object_id}),
    )
    if any(database[name].find_one(query, {"_id": 1}) for name, query in references):
        return jsonify(message="This category is in use. Remove its subcategories or learning content first."), 409
    database.categories.delete_one({"_id": object_id})
    return jsonify(message="Category deleted.")


@admin_bp.get("/announcements")
@roles_required("admin")
def admin_announcements():
    items = get_database().announcements.find({}).sort("created_at", DESCENDING)
    return jsonify(announcements=[serialize_value(item) for item in items])


@admin_bp.post("/announcements")
@roles_required("admin")
def create_announcement():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    title = _text(payload, "title", 120)
    body = _text(payload, "body", 4000)
    if not title or not body:
        return jsonify(message="An announcement title and message are required."), 400
    if "is_published" in payload and not isinstance(payload["is_published"], bool):
        return jsonify(message="is_published must be true or false."), 400
    now = datetime.now(timezone.utc)
    announcement = {
        "title": title, "body": body, "is_published": payload.get("is_published", True),
        "created_at": now, "updated_at": now,
    }
    result = get_database().announcements.insert_one(announcement)
    announcement["_id"] = result.inserted_id
    return jsonify(announcement=serialize_value(announcement)), 201


@admin_bp.put("/announcements/<announcement_id>")
@roles_required("admin")
def update_announcement(announcement_id):
    object_id = parse_object_id(announcement_id)
    if object_id is None:
        return _not_found("Announcement")
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    title = _text(payload, "title", 120)
    body = _text(payload, "body", 4000)
    if not title or not body:
        return jsonify(message="An announcement title and message are required."), 400
    if "is_published" in payload and not isinstance(payload["is_published"], bool):
        return jsonify(message="is_published must be true or false."), 400
    result = get_database().announcements.update_one(
        {"_id": object_id},
        {"$set": {
            "title": title, "body": body,
            "is_published": payload.get("is_published", True),
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    if not result.matched_count:
        return _not_found("Announcement")
    return jsonify(message="Announcement updated.")


@admin_bp.delete("/announcements/<announcement_id>")
@roles_required("admin")
def delete_announcement(announcement_id):
    object_id = parse_object_id(announcement_id)
    if object_id is None or not get_database().announcements.delete_one({"_id": object_id}).deleted_count:
        return _not_found("Announcement")
    return jsonify(message="Announcement deleted.")


