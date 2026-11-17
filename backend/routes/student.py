from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity
from pymongo import DESCENDING
from werkzeug.security import check_password_hash, generate_password_hash

from ..database import get_database
from ..middleware.auth import current_user, roles_required
from ..utils.responses import parse_object_id
from .auth import AGE_GROUPS, public_user
from .quizzes import _existing_result

student_bp = Blueprint("student", __name__, url_prefix="/api/student")


@student_bp.get("/profile")
@roles_required("student")
def profile():
    return jsonify(user=public_user(current_user()))


@student_bp.put("/profile")
@roles_required("student")
def update_profile():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    raw_name = payload.get("name", "")
    name = raw_name.strip() if isinstance(raw_name, str) else ""
    age_group = payload.get("age_group")
    if not name or len(name) > 80:
        return jsonify(message="Enter a name between 1 and 80 characters."), 400
    if age_group not in AGE_GROUPS:
        return jsonify(message="Choose a valid age group."), 400
    user_id = parse_object_id(get_jwt_identity())
    get_database().users.update_one(
        {"_id": user_id, "role": "student", "is_active": True},
        {"$set": {"name": name, "age_group": age_group, "updated_at": datetime.now(timezone.utc)}},
    )
    updated_user = get_database().users.find_one({"_id": user_id})
    return jsonify(user=public_user(updated_user))


@student_bp.put("/profile/password")
@roles_required("student")
def update_password():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    current_password = payload.get("current_password")
    new_password = payload.get("new_password")
    if not isinstance(current_password, str) or not isinstance(new_password, str):
        return jsonify(message="Current and new passwords are required."), 400
    if len(new_password) < 8 or len(new_password) > 128:
        return jsonify(message="New password must be between 8 and 128 characters."), 400
    user_id = parse_object_id(get_jwt_identity())
    database = get_database()
    user = database.users.find_one({"_id": user_id, "role": "student", "is_active": True})
    if not user or not check_password_hash(user["password_hash"], current_password):
        return jsonify(message="Current password is incorrect."), 400
    if check_password_hash(user["password_hash"], new_password):
        return jsonify(message="Choose a new password different from your current one."), 400
    database.users.update_one(
        {"_id": user_id},
        {"$set": {
            "password_hash": generate_password_hash(new_password),
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    return jsonify(message="Password updated successfully.")


@student_bp.get("/dashboard")
@roles_required("student")
def dashboard():
    database = get_database()
    user = current_user()
    user_id = parse_object_id(get_jwt_identity())
    age_group = user.get("age_group")
    submitted = database.attempts.find({
        "user_id": user_id,
        "assessment_type": {"$in": ["quiz", "test"]},
        "status": "submitted",
    }).sort("submitted_at", DESCENDING).limit(100)
    attempts = list(submitted)
    percentages = [
        item["score"] / item["total_marks"] * 100
        for item in attempts
        if isinstance(item.get("score"), (int, float))
        and isinstance(item.get("total_marks"), (int, float))
        and item["total_marks"] > 0
    ]
    recent_materials = database.materials.find({"age_group": age_group}).sort("created_at", DESCENDING).limit(4)
    recent_announcements = database.announcements.find({"is_published": True}).sort("created_at", DESCENDING).limit(3)
    return jsonify(
        stats={
            "materials_available": database.materials.count_documents({"age_group": age_group}),
            "quizzes_completed": database.attempts.count_documents({
                "user_id": user_id, "assessment_type": "quiz", "status": "submitted",
            }),
            "tests_completed": database.attempts.count_documents({
                "user_id": user_id, "assessment_type": "test", "status": "submitted",
            }),
            "average_score": round(sum(percentages) / len(percentages), 1) if percentages else None,
        },
        recent_results=[_existing_result(item) for item in attempts[:5]],
        recent_materials=[{
            "id": str(item["_id"]),
            "title": item["title"],
            "category_name": item.get("category_name", ""),
            "period_name": item.get("period_name", ""),
            "file_name": item["file_name"],
            "file_size": item["file_size"],
            "file_type": item["file_type"],
            "created_at": item["created_at"],
        } for item in recent_materials],
        announcements=[{
            "id": str(item["_id"]),
            "title": item["title"],
            "body": item["body"],
            "created_at": item["created_at"],
        } for item in recent_announcements],
    )
