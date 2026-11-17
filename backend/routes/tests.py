from datetime import datetime, timedelta, timezone

from bson import ObjectId
from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity
from pymongo import DESCENDING
from pymongo.errors import PyMongoError

from ..database import get_database
from ..middleware.auth import current_user, roles_required
from ..utils.responses import parse_object_id
from .quizzes import _as_utc, _graded_result, _question_response, _validate_questions

tests_bp = Blueprint("tests", __name__, url_prefix="/api")
AGE_GROUPS = {"10-13", "14-16", "17-19", "20+"}


def _parse_utc(value):
    if not isinstance(value, str):
        return None
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if result.tzinfo is None:
        return None
    return result.astimezone(timezone.utc)


def _test_response(test, question_count=None, now=None):
    result = {
        "id": str(test["_id"]),
        "title": test["title"],
        "description": test.get("description", ""),
        "category_id": str(test["category_id"]),
        "category_name": test.get("category_name", ""),
        "period_id": str(test["period_id"]),
        "period_name": test.get("period_name", ""),
        "age_group": test["age_group"],
        "duration_minutes": test["duration_minutes"],
        "total_marks": test["total_marks"],
        "passing_marks": test["passing_marks"],
        "scheduled_at": test["scheduled_at"],
        "closes_at": test["closes_at"],
        "is_active": test.get("is_active", True),
        "created_at": test["created_at"],
    }
    if question_count is not None:
        result["question_count"] = question_count
    if now is not None:
        result["is_available"] = _as_utc(test["scheduled_at"]) <= now < _as_utc(test["closes_at"])
    return result


def _validated_test(payload):
    title = payload.get("title")
    description = payload.get("description", "")
    category_id = parse_object_id(payload.get("category_id"))
    period_id = parse_object_id(payload.get("period_id"))
    age_group = payload.get("age_group")
    duration = payload.get("duration_minutes")
    total_marks = payload.get("total_marks")
    passing_marks = payload.get("passing_marks")
    scheduled_at = _parse_utc(payload.get("scheduled_at"))
    closes_at = _parse_utc(payload.get("closes_at"))
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 150:
        return None, "Enter an examination title of up to 150 characters."
    if not isinstance(description, str) or len(description) > 2000:
        return None, "The examination description must be 2000 characters or fewer."
    if not category_id or not period_id:
        return None, "Choose a valid knowledge category and historical period."
    if age_group not in AGE_GROUPS:
        return None, "Choose a valid age group."
    if not isinstance(duration, int) or isinstance(duration, bool) or not 1 <= duration <= 240:
        return None, "Test duration must be from 1 to 240 minutes."
    if not isinstance(total_marks, (int, float)) or isinstance(total_marks, bool) or not 1 <= total_marks <= 1000:
        return None, "Total marks must be between 1 and 1000."
    if not isinstance(passing_marks, (int, float)) or isinstance(passing_marks, bool) or not 0 <= passing_marks <= total_marks:
        return None, "Passing marks must be between zero and total marks."
    if scheduled_at is None or closes_at is None or closes_at <= scheduled_at:
        return None, "Provide valid scheduled and closing dates; the closing date must be later."
    questions, error = _validate_questions(payload.get("questions"), total_marks)
    if error:
        return None, error
    return {
        "title": title.strip(),
        "description": description.strip(),
        "category_id": category_id,
        "period_id": period_id,
        "age_group": age_group,
        "duration_minutes": duration,
        "total_marks": total_marks,
        "passing_marks": passing_marks,
        "scheduled_at": scheduled_at,
        "closes_at": closes_at,
        "questions": questions,
    }, None


def _test_question_documents(database, test_id):
    return list(database.questions.find({"test_id": test_id}).sort("order", 1))


def _question_admin_response(question):
    return {
        **_question_response(question),
        "correct_option": question["correct_option"],
        "explanation": question.get("explanation", ""),
    }


def _apply_test_update(database, test, values):
    category = database.categories.find_one({"_id": values["category_id"], "is_active": True})
    period = database.periods.find_one({"_id": values["period_id"], "is_active": True})
    if not category or not period:
        return None, "The selected category or historical period is unavailable."
    now = datetime.now(timezone.utc)
    test_id = test["_id"]
    question_documents = [
        {**question, "test_id": test_id, "created_at": now, "updated_at": now}
        for question in values["questions"]
    ]
    inserted = database.questions.insert_many(question_documents)
    updated = {
        key: value for key, value in values.items() if key != "questions"
    }
    updated.update({
        "category_name": category["name"],
        "period_name": period["name"],
        "question_ids": inserted.inserted_ids,
        "updated_at": now,
    })
    try:
        database.tests.update_one({"_id": test_id}, {"$set": updated})
    except PyMongoError:
        try:
            database.questions.delete_many({"_id": {"$in": inserted.inserted_ids}})
        except PyMongoError:
            current_app.logger.exception("Could not clean up replacement questions after test update failed")
        raise
    old_question_ids = test.get("question_ids", [])
    if old_question_ids:
        database.questions.delete_many({"_id": {"$in": old_question_ids}})
    test.update(updated)
    return test, None


@tests_bp.get("/tests")
@roles_required("student")
def list_tests():
    user = current_user()
    database = get_database()
    now = datetime.now(timezone.utc)
    query = {
        "is_active": True,
        "age_group": user.get("age_group"),
        "closes_at": {"$gt": now},
    }
    category_value = request.args.get("category_id")
    if category_value:
        category_id = parse_object_id(category_value)
        if category_id is None:
            return jsonify(message="Invalid category_id."), 400
        query["category_id"] = category_id
    items = database.tests.find(query).sort("scheduled_at", 1)
    return jsonify(tests=[
        _test_response(item, database.questions.count_documents({"test_id": item["_id"]}), now)
        for item in items
    ])


@tests_bp.get("/admin/tests")
@roles_required("admin")
def admin_tests():
    database = get_database()
    items = database.tests.find({}).sort("scheduled_at", DESCENDING)
    return jsonify(tests=[
        _test_response(item, database.questions.count_documents({"test_id": item["_id"]}))
        for item in items
    ])


@tests_bp.get("/admin/tests/<test_id>")
@roles_required("admin")
def admin_test_details(test_id):
    object_id = parse_object_id(test_id)
    if object_id is None:
        return jsonify(message="Examination was not found."), 404
    database = get_database()
    test = database.tests.find_one({"_id": object_id})
    if not test:
        return jsonify(message="Examination was not found."), 404
    questions = _test_question_documents(database, object_id)
    return jsonify(
        test=_test_response(test, len(questions)),
        questions=[_question_admin_response(question) for question in questions],
    )


@tests_bp.post("/admin/tests")
@roles_required("admin")
def create_test():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    values, error = _validated_test(payload)
    if error:
        return jsonify(message=error), 400
    database = get_database()
    category = database.categories.find_one({"_id": values["category_id"], "is_active": True})
    period = database.periods.find_one({"_id": values["period_id"], "is_active": True})
    if not category or not period:
        return jsonify(message="The selected category or historical period is unavailable."), 400
    now = datetime.now(timezone.utc)
    test_id = ObjectId()
    questions = [
        {**question, "test_id": test_id, "created_at": now, "updated_at": now}
        for question in values.pop("questions")
    ]
    test = {
        **values,
        "category_name": category["name"],
        "period_name": period["name"],
        "question_ids": [],
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "_id": test_id,
    }
    try:
        inserted = database.questions.insert_many(questions)
        test["question_ids"] = inserted.inserted_ids
        database.tests.insert_one(test)
    except PyMongoError:
        try:
            database.questions.delete_many({"test_id": test_id})
        except PyMongoError:
            current_app.logger.exception("Could not clean up questions after test creation failed")
        raise
    return jsonify(test=_test_response(test, len(questions))), 201


@tests_bp.put("/admin/tests/<test_id>")
@roles_required("admin")
def update_test(test_id):
    object_id = parse_object_id(test_id)
    if object_id is None:
        return jsonify(message="Examination was not found."), 404
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    database = get_database()
    test = database.tests.find_one({"_id": object_id})
    if not test:
        return jsonify(message="Examination was not found."), 404
    if database.attempts.find_one({"assessment_id": object_id, "status": "in_progress"}):
        return jsonify(message="This examination has an active student attempt and cannot be edited."), 409
    values, error = _validated_test(payload)
    if error:
        return jsonify(message=error), 400
    updated, error = _apply_test_update(database, test, values)
    if error:
        return jsonify(message=error), 400
    return jsonify(test=_test_response(updated, len(values["questions"])))


@tests_bp.delete("/admin/tests/<test_id>")
@roles_required("admin")
def archive_test(test_id):
    object_id = parse_object_id(test_id)
    if object_id is None:
        return jsonify(message="Examination was not found."), 404
    result = get_database().tests.update_one(
        {"_id": object_id, "is_active": True},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
    )
    if not result.matched_count:
        return jsonify(message="Examination was not found."), 404
    return jsonify(message="Examination archived. Previous results have been retained.")


@tests_bp.get("/admin/tests/<test_id>/results")
@roles_required("admin")
def admin_test_results(test_id):
    object_id = parse_object_id(test_id)
    if object_id is None:
        return jsonify(message="Examination was not found."), 404
    database = get_database()
    if not database.tests.find_one({"_id": object_id}, {"_id": 1}):
        return jsonify(message="Examination was not found."), 404
    expired = database.attempts.find({
        "assessment_id": object_id,
        "assessment_type": "test",
        "status": "in_progress",
        "expires_at": {"$lte": datetime.now(timezone.utc)},
    })
    for attempt in expired:
        _graded_result(database, attempt, timed_out=True)
    attempts = database.attempts.find({
        "assessment_id": object_id,
        "assessment_type": "test",
        "status": "submitted",
    }).sort("submitted_at", DESCENDING).limit(500)
    results = []
    for attempt in attempts:
        student = database.users.find_one(
            {"_id": attempt["user_id"], "role": "student"},
            {"name": 1, "email": 1},
        )
        results.append({
            "attempt_id": str(attempt["_id"]),
            "student_name": student["name"] if student else "Unavailable account",
            "student_email": student["email"] if student else "",
            "score": attempt["score"],
            "total_marks": attempt["total_marks"],
            "passing_marks": attempt.get("passing_marks", 0),
            "passed": attempt.get("passed", attempt["score"] >= attempt.get("passing_marks", 0)),
            "correct_count": attempt["correct_count"],
            "question_count": attempt["question_count"],
            "timed_out": attempt.get("timed_out", False),
            "submitted_at": attempt["submitted_at"],
        })
    return jsonify(results=results)


@tests_bp.post("/student/tests/<test_id>/start")
@roles_required("student")
def start_test(test_id):
    object_id = parse_object_id(test_id)
    user = current_user()
    database = get_database()
    test = database.tests.find_one({
        "_id": object_id, "is_active": True, "age_group": user.get("age_group"),
    }) if object_id else None
    if not test:
        return jsonify(message="Examination was not found or is not available for your age group."), 404
    now = datetime.now(timezone.utc)
    if now < _as_utc(test["scheduled_at"]):
        return jsonify(message="This examination has not opened yet."), 403
    if now >= _as_utc(test["closes_at"]):
        return jsonify(message="The scheduled examination period has ended."), 403
    user_id = parse_object_id(get_jwt_identity())
    active_attempt = database.attempts.find_one({
        "user_id": user_id,
        "assessment_id": object_id,
        "assessment_type": "test",
        "status": "in_progress",
    })
    if active_attempt:
        if _as_utc(active_attempt["expires_at"]) <= now:
            result = _graded_result(database, active_attempt, timed_out=True)
            return jsonify(message="This test attempt expired and has been submitted.", result=result), 409
        questions = list(database.questions.find({"_id": {"$in": active_attempt["question_ids"]}}).sort("order", 1))
        return jsonify(
            attempt={
                "id": str(active_attempt["_id"]), "started_at": active_attempt["started_at"],
                "expires_at": active_attempt["expires_at"], "answers": active_attempt.get("answers", {}),
            },
            test=_test_response(test, len(questions)),
            questions=[_question_response(question) for question in questions],
        )

    questions = _test_question_documents(database, object_id)
    if not questions:
        return jsonify(message="This examination has no questions."), 409
    expires_at = min(now + timedelta(minutes=test["duration_minutes"]), _as_utc(test["closes_at"]))
    attempt = {
        "user_id": user_id,
        "assessment_id": object_id,
        "assessment_type": "test",
        "assessment_title": test["title"],
        "question_ids": [question["_id"] for question in questions],
        "answers": {},
        "status": "in_progress",
        "total_marks": test["total_marks"],
        "passing_marks": test["passing_marks"],
        "started_at": now,
        "expires_at": expires_at,
        "created_at": now,
        "updated_at": now,
    }
    attempt_id = database.attempts.insert_one(attempt).inserted_id
    return jsonify(
        attempt={"id": str(attempt_id), "started_at": now, "expires_at": expires_at, "answers": {}},
        test=_test_response(test, len(questions)),
        questions=[_question_response(question) for question in questions],
    ), 201


@tests_bp.put("/student/tests/attempts/<attempt_id>/answers")
@roles_required("student")
def save_test_answer(attempt_id):
    attempt_id = parse_object_id(attempt_id)
    user_id = parse_object_id(get_jwt_identity())
    payload = request.get_json(silent=True)
    if attempt_id is None:
        return jsonify(message="Test attempt was not found."), 404
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    question_id = parse_object_id(payload.get("question_id"))
    option = payload.get("selected_option")
    if question_id is None or not isinstance(option, int) or isinstance(option, bool) or option not in range(4):
        return jsonify(message="Choose one of the four answer options."), 400
    database = get_database()
    attempt = database.attempts.find_one({
        "_id": attempt_id, "user_id": user_id, "assessment_type": "test", "status": "in_progress",
    })
    if not attempt:
        return jsonify(message="Active test attempt was not found."), 404
    now = datetime.now(timezone.utc)
    if now >= _as_utc(attempt["expires_at"]):
        result = _graded_result(database, attempt, timed_out=True)
        return jsonify(message="Time expired; saved answers were submitted.", result=result), 409
    if question_id not in attempt["question_ids"]:
        return jsonify(message="That question is not part of this test."), 400
    updated = database.attempts.update_one(
        {"_id": attempt_id, "status": "in_progress", "expires_at": {"$gt": now}},
        {"$set": {f"answers.{question_id}": option, "updated_at": now}},
    )
    if not updated.matched_count:
        refreshed = database.attempts.find_one({"_id": attempt_id})
        if refreshed and refreshed.get("status") == "in_progress" and _as_utc(refreshed["expires_at"]) <= now:
            result = _graded_result(database, refreshed, timed_out=True)
            return jsonify(message="Time expired; saved answers were submitted.", result=result), 409
        return jsonify(message="This test was submitted before the answer could be saved."), 409
    return jsonify(message="Answer saved.")


@tests_bp.post("/student/tests/attempts/<attempt_id>/submit")
@roles_required("student")
def submit_test(attempt_id):
    object_id = parse_object_id(attempt_id)
    if object_id is None:
        return jsonify(message="Test attempt was not found."), 404
    attempt = get_database().attempts.find_one({
        "_id": object_id,
        "user_id": parse_object_id(get_jwt_identity()),
        "assessment_type": "test",
    })
    if not attempt:
        return jsonify(message="Test attempt was not found."), 404
    if attempt["status"] == "submitted":
        from .quizzes import _existing_result
        return jsonify(result=_existing_result(attempt))
    timed_out = datetime.now(timezone.utc) >= _as_utc(attempt["expires_at"])
    return jsonify(result=_graded_result(get_database(), attempt, timed_out=timed_out))


@tests_bp.get("/student/tests/results")
@roles_required("student")
def student_test_results():
    database = get_database()
    user_id = parse_object_id(get_jwt_identity())
    now = datetime.now(timezone.utc)
    expired = database.attempts.find({
        "user_id": user_id,
        "assessment_type": "test",
        "status": "in_progress",
        "expires_at": {"$lte": now},
    })
    for attempt in expired:
        _graded_result(database, attempt, timed_out=True)
    from .quizzes import _existing_result
    items = database.attempts.find({
        "user_id": user_id, "assessment_type": "test", "status": "submitted",
    }).sort("submitted_at", DESCENDING).limit(100)
    return jsonify(results=[_existing_result(item) for item in items])
