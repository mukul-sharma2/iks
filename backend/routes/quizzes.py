from datetime import datetime, timedelta, timezone

from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity
from pymongo import DESCENDING
from pymongo.errors import PyMongoError

from ..database import get_database
from ..middleware.auth import current_user, roles_required
from ..utils.responses import parse_object_id

quizzes_bp = Blueprint("quizzes", __name__, url_prefix="/api")


def _as_utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _validate_questions(raw_questions, total_marks):
    if not isinstance(raw_questions, list) or not 1 <= len(raw_questions) <= 50:
        return None, "A quiz must contain between 1 and 50 questions."
    marks_per_question = total_marks / len(raw_questions)
    questions = []
    for index, item in enumerate(raw_questions):
        if not isinstance(item, dict):
            return None, f"Question {index + 1} is invalid."
        prompt = item.get("prompt")
        options = item.get("options")
        correct_option = item.get("correct_option")
        explanation = item.get("explanation", "")
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt.strip()) > 1000:
            return None, f"Question {index + 1} needs a prompt of up to 1000 characters."
        if not isinstance(options, list) or len(options) != 4 or any(
            not isinstance(option, str) or not option.strip() or len(option.strip()) > 300
            for option in options
        ):
            return None, f"Question {index + 1} must have four non-empty options of up to 300 characters."
        if not isinstance(correct_option, int) or isinstance(correct_option, bool) or correct_option not in range(4):
            return None, f"Question {index + 1} must specify a correct option."
        if not isinstance(explanation, str) or len(explanation) > 2000:
            return None, f"Question {index + 1} explanation must be 2000 characters or fewer."
        questions.append({
            "prompt": prompt.strip(),
            "options": [option.strip() for option in options],
            "correct_option": correct_option,
            "explanation": explanation.strip(),
            "marks": marks_per_question,
            "order": index,
        })
    return questions, None


def _quiz_response(quiz, question_count=None):
    result = {
        "id": str(quiz["_id"]),
        "title": quiz["title"],
        "description": quiz.get("description", ""),
        "category_id": str(quiz["category_id"]),
        "category_name": quiz.get("category_name", ""),
        "period_id": str(quiz["period_id"]),
        "period_name": quiz.get("period_name", ""),
        "age_group": quiz["age_group"],
        "duration_minutes": quiz["duration_minutes"],
        "total_marks": quiz["total_marks"],
        "is_active": quiz.get("is_active", True),
        "created_at": quiz["created_at"],
    }
    if question_count is not None:
        result["question_count"] = question_count
    return result


def _question_response(question):
    return {
        "id": str(question["_id"]),
        "prompt": question["prompt"],
        "options": question["options"],
        "order": question["order"],
    }


def _graded_result(database, attempt, timed_out=False):
    question_ids = attempt["question_ids"]
    questions = list(database.questions.find({"_id": {"$in": question_ids}}).sort("order", 1))
    answers = attempt.get("answers", {})
    details = []
    score = 0.0
    correct_count = 0
    for question in questions:
        selected = answers.get(str(question["_id"]))
        is_correct = selected == question["correct_option"]
        if is_correct:
            score += question["marks"]
            correct_count += 1
        details.append({
            "question_id": str(question["_id"]),
            "prompt": question["prompt"],
            "options": question["options"],
            "selected_option": selected,
            "correct_option": question["correct_option"],
            "is_correct": is_correct,
            "explanation": question.get("explanation", ""),
            "marks": question["marks"],
        })
    score = round(score, 2)
    now = datetime.now(timezone.utc)
    database.attempts.update_one(
        {"_id": attempt["_id"], "status": "in_progress"},
        {"$set": {
            "status": "submitted",
            "score": score,
            "total_marks": attempt["total_marks"],
            "passing_marks": attempt.get("passing_marks"),
            "passed": score >= attempt["passing_marks"] if attempt.get("passing_marks") is not None else None,
            "correct_count": correct_count,
            "question_count": len(questions),
            "results": details,
            "timed_out": timed_out,
            "submitted_at": now,
            "updated_at": now,
        }},
    )
    result = {
        "id": str(attempt["_id"]),
        "assessment_id": str(attempt["assessment_id"]),
        "assessment_title": attempt["assessment_title"],
        "assessment_type": attempt["assessment_type"],
        "score": score,
        "total_marks": attempt["total_marks"],
        "passing_marks": attempt.get("passing_marks"),
        "passed": score >= attempt["passing_marks"] if attempt.get("passing_marks") is not None else None,
        "correct_count": correct_count,
        "question_count": len(questions),
        "timed_out": timed_out,
        "submitted_at": now,
        "results": details,
    }
    prefix = "quiz" if attempt["assessment_type"] == "quiz" else "test"
    result[f"{prefix}_id"] = str(attempt["assessment_id"])
    result[f"{prefix}_title"] = attempt["assessment_title"]
    return result


def _existing_result(attempt):
    result = {
        "id": str(attempt["_id"]),
        "assessment_id": str(attempt["assessment_id"]),
        "assessment_title": attempt["assessment_title"],
        "assessment_type": attempt["assessment_type"],
        "score": attempt["score"],
        "total_marks": attempt["total_marks"],
        "passing_marks": attempt.get("passing_marks"),
        "passed": attempt.get("passed"),
        "correct_count": attempt["correct_count"],
        "question_count": attempt["question_count"],
        "timed_out": attempt.get("timed_out", False),
        "submitted_at": attempt["submitted_at"],
        "results": attempt["results"],
    }
    prefix = "quiz" if attempt["assessment_type"] == "quiz" else "test"
    result[f"{prefix}_id"] = str(attempt["assessment_id"])
    result[f"{prefix}_title"] = attempt["assessment_title"]
    return result


@quizzes_bp.get("/quizzes")
@roles_required("student")
def list_quizzes():
    user = current_user()
    query = {"is_active": True, "age_group": user.get("age_group")}
    category_value = request.args.get("category_id")
    if category_value:
        category_id = parse_object_id(category_value)
        if category_id is None:
            return jsonify(message="Invalid category_id."), 400
        query["category_id"] = category_id
    items = get_database().quizzes.find(query).sort("created_at", DESCENDING)
    database = get_database()
    return jsonify(quizzes=[
        _quiz_response(item, database.questions.count_documents({"quiz_id": item["_id"]}))
        for item in items
    ])


@quizzes_bp.get("/quizzes/<quiz_id>")
@roles_required("student")
def get_quiz(quiz_id):
    object_id = parse_object_id(quiz_id)
    user = current_user()
    database = get_database()
    quiz = database.quizzes.find_one({
        "_id": object_id, "is_active": True, "age_group": user.get("age_group"),
    }) if object_id else None
    if not quiz:
        return jsonify(message="Quiz was not found or is not available for your age group."), 404
    questions = list(database.questions.find({"quiz_id": object_id}).sort("order", 1))
    return jsonify(
        quiz=_quiz_response(quiz, len(questions)),
        questions=[_question_response(question) for question in questions],
    )


@quizzes_bp.post("/admin/quizzes")
@roles_required("admin")
def create_quiz():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    title = payload.get("title")
    description = payload.get("description", "")
    category_id = parse_object_id(payload.get("category_id"))
    period_id = parse_object_id(payload.get("period_id"))
    age_group = payload.get("age_group")
    duration = payload.get("duration_minutes")
    total_marks = payload.get("total_marks")
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 150:
        return jsonify(message="Enter a quiz title of up to 150 characters."), 400
    if not isinstance(description, str) or len(description) > 2000:
        return jsonify(message="The quiz description must be 2000 characters or fewer."), 400
    if not category_id or not period_id:
        return jsonify(message="Choose a valid knowledge category and historical period."), 400
    if age_group not in {"10-13", "14-16", "17-19", "20+"}:
        return jsonify(message="Choose a valid age group."), 400
    if not isinstance(duration, int) or isinstance(duration, bool) or not 1 <= duration <= 240:
        return jsonify(message="Quiz duration must be from 1 to 240 minutes."), 400
    if not isinstance(total_marks, (int, float)) or isinstance(total_marks, bool) or not 1 <= total_marks <= 1000:
        return jsonify(message="Total marks must be between 1 and 1000."), 400
    questions, error = _validate_questions(payload.get("questions"), total_marks)
    if error:
        return jsonify(message=error), 400
    database = get_database()
    category = database.categories.find_one({"_id": category_id, "is_active": True})
    period = database.periods.find_one({"_id": period_id, "is_active": True})
    if not category or not period:
        return jsonify(message="The selected category or historical period is unavailable."), 400
    now = datetime.now(timezone.utc)
    quiz = {
        "title": title.strip(),
        "description": description.strip(),
        "category_id": category_id,
        "category_name": category["name"],
        "period_id": period_id,
        "period_name": period["name"],
        "age_group": age_group,
        "duration_minutes": duration,
        "total_marks": total_marks,
        "question_ids": [],
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    quiz_id = ObjectId()
    quiz["_id"] = quiz_id
    question_documents = [{**question, "quiz_id": quiz_id, "created_at": now, "updated_at": now} for question in questions]
    try:
        inserted = database.questions.insert_many(question_documents)
        quiz["question_ids"] = inserted.inserted_ids
        database.quizzes.insert_one(quiz)
    except PyMongoError:
        try:
            database.questions.delete_many({"quiz_id": quiz_id})
        except PyMongoError:
            current_app.logger.exception("Could not clean up questions after quiz creation failed")
        raise
    return jsonify(quiz=_quiz_response(quiz, len(questions))), 201


@quizzes_bp.get("/admin/quizzes")
@roles_required("admin")
def admin_quizzes():
    database = get_database()
    items = database.quizzes.find({}).sort("created_at", DESCENDING)
    return jsonify(quizzes=[
        {**_quiz_response(item, database.questions.count_documents({"quiz_id": item["_id"]})),
         "is_active": item.get("is_active", True)}
        for item in items
    ])


@quizzes_bp.get("/admin/quizzes/<quiz_id>")
@roles_required("admin")
def admin_quiz_details(quiz_id):
    object_id = parse_object_id(quiz_id)
    if object_id is None:
        return jsonify(message="Quiz was not found."), 404
    database = get_database()
    quiz = database.quizzes.find_one({"_id": object_id})
    if not quiz:
        return jsonify(message="Quiz was not found."), 404
    questions = list(database.questions.find({"quiz_id": object_id}).sort("order", 1))
    return jsonify(
        quiz=_quiz_response(quiz, len(questions)),
        questions=[{
            **_question_response(question),
            "correct_option": question["correct_option"],
            "explanation": question.get("explanation", ""),
        } for question in questions],
    )


@quizzes_bp.put("/admin/quizzes/<quiz_id>")
@roles_required("admin")
def update_quiz(quiz_id):
    object_id = parse_object_id(quiz_id)
    if object_id is None:
        return jsonify(message="Quiz was not found."), 404
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    existing = get_database().quizzes.find_one({"_id": object_id})
    if not existing:
        return jsonify(message="Quiz was not found."), 404
    active_attempt = get_database().attempts.find_one({
        "assessment_id": object_id, "status": "in_progress",
    })
    if active_attempt:
        return jsonify(message="This quiz has an active student attempt and cannot be edited right now."), 409

    title = payload.get("title")
    description = payload.get("description", "")
    category_id = parse_object_id(payload.get("category_id"))
    period_id = parse_object_id(payload.get("period_id"))
    age_group = payload.get("age_group")
    duration = payload.get("duration_minutes")
    total_marks = payload.get("total_marks")
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 150:
        return jsonify(message="Enter a quiz title of up to 150 characters."), 400
    if not isinstance(description, str) or len(description) > 2000:
        return jsonify(message="The quiz description must be 2000 characters or fewer."), 400
    if not category_id or not period_id:
        return jsonify(message="Choose a valid knowledge category and historical period."), 400
    if age_group not in {"10-13", "14-16", "17-19", "20+"}:
        return jsonify(message="Choose a valid age group."), 400
    if not isinstance(duration, int) or isinstance(duration, bool) or not 1 <= duration <= 240:
        return jsonify(message="Quiz duration must be from 1 to 240 minutes."), 400
    if not isinstance(total_marks, (int, float)) or isinstance(total_marks, bool) or not 1 <= total_marks <= 1000:
        return jsonify(message="Total marks must be between 1 and 1000."), 400
    questions, error = _validate_questions(payload.get("questions"), total_marks)
    if error:
        return jsonify(message=error), 400
    database = get_database()
    category = database.categories.find_one({"_id": category_id, "is_active": True})
    period = database.periods.find_one({"_id": period_id, "is_active": True})
    if not category or not period:
        return jsonify(message="The selected category or historical period is unavailable."), 400
    now = datetime.now(timezone.utc)
    question_documents = [{**question, "quiz_id": object_id, "created_at": now, "updated_at": now} for question in questions]
    inserted = database.questions.insert_many(question_documents)
    updated = {
        "title": title.strip(),
        "description": description.strip(),
        "category_id": category_id,
        "category_name": category["name"],
        "period_id": period_id,
        "period_name": period["name"],
        "age_group": age_group,
        "duration_minutes": duration,
        "total_marks": total_marks,
        "question_ids": inserted.inserted_ids,
        "updated_at": now,
    }
    try:
        database.quizzes.update_one({"_id": object_id}, {"$set": updated})
    except PyMongoError:
        try:
            database.questions.delete_many({"_id": {"$in": inserted.inserted_ids}})
        except PyMongoError:
            current_app.logger.exception("Could not clean up replacement questions after quiz update failed")
        raise
    database.questions.delete_many({"_id": {"$in": existing.get("question_ids", [])}})
    existing.update(updated)
    return jsonify(quiz=_quiz_response(existing, len(questions)))


@quizzes_bp.delete("/admin/quizzes/<quiz_id>")
@roles_required("admin")
def delete_quiz(quiz_id):
    object_id = parse_object_id(quiz_id)
    if object_id is None:
        return jsonify(message="Quiz was not found."), 404
    result = get_database().quizzes.update_one(
        {"_id": object_id, "is_active": True},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
    )
    if not result.matched_count:
        return jsonify(message="Quiz was not found."), 404
    return jsonify(message="Quiz archived. Previous results have been retained.")


@quizzes_bp.post("/student/quizzes/<quiz_id>/start")
@roles_required("student")
def start_quiz(quiz_id):
    object_id = parse_object_id(quiz_id)
    user = current_user()
    database = get_database()
    quiz = database.quizzes.find_one({
        "_id": object_id, "is_active": True, "age_group": user.get("age_group"),
    }) if object_id else None
    if not quiz:
        return jsonify(message="Quiz was not found or is not available for your age group."), 404

    now = datetime.now(timezone.utc)
    active_attempt = database.attempts.find_one({
        "user_id": parse_object_id(get_jwt_identity()),
        "assessment_id": object_id,
        "assessment_type": "quiz",
        "status": "in_progress",
    })
    if active_attempt:
        if _as_utc(active_attempt["expires_at"]) <= now:
            result = _graded_result(database, active_attempt, timed_out=True)
            return jsonify(message="This quiz attempt expired and has been submitted.", result=result), 409
        question_documents = list(database.questions.find({"_id": {"$in": active_attempt["question_ids"]}}).sort("order", 1))
        return jsonify(attempt={
            "id": str(active_attempt["_id"]),
            "started_at": active_attempt["started_at"],
            "expires_at": active_attempt["expires_at"],
            "answers": active_attempt.get("answers", {}),
        }, quiz=_quiz_response(quiz, len(question_documents)), questions=[_question_response(q) for q in question_documents])

    questions = list(database.questions.find({"quiz_id": object_id}).sort("order", 1))
    if not questions:
        return jsonify(message="This quiz has no questions yet."), 409
    expires_at = now + timedelta(minutes=quiz["duration_minutes"])
    attempt = {
        "user_id": parse_object_id(get_jwt_identity()),
        "assessment_id": object_id,
        "assessment_type": "quiz",
        "assessment_title": quiz["title"],
        "question_ids": [question["_id"] for question in questions],
        "answers": {},
        "status": "in_progress",
        "total_marks": quiz["total_marks"],
        "passing_marks": None,
        "started_at": now,
        "expires_at": expires_at,
        "created_at": now,
        "updated_at": now,
    }
    attempt_id = database.attempts.insert_one(attempt).inserted_id
    return jsonify(
        attempt={"id": str(attempt_id), "started_at": now, "expires_at": expires_at, "answers": {}},
        quiz=_quiz_response(quiz, len(questions)),
        questions=[_question_response(question) for question in questions],
    ), 201


@quizzes_bp.put("/student/quizzes/attempts/<attempt_id>/answers")
@roles_required("student")
def save_answer(attempt_id):
    attempt_object_id = parse_object_id(attempt_id)
    user_id = parse_object_id(get_jwt_identity())
    if attempt_object_id is None:
        return jsonify(message="Quiz attempt was not found."), 404
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    question_id = parse_object_id(payload.get("question_id"))
    selected_option = payload.get("selected_option")
    if question_id is None or not isinstance(selected_option, int) or isinstance(selected_option, bool) or selected_option not in range(4):
        return jsonify(message="Choose one of the four answer options."), 400
    database = get_database()
    attempt = database.attempts.find_one({
        "_id": attempt_object_id,
        "user_id": user_id,
        "assessment_type": {"$in": ["quiz", "test"]},
        "status": "in_progress",
    })
    if not attempt:
        return jsonify(message="Active quiz attempt was not found."), 404
    now = datetime.now(timezone.utc)
    if now >= _as_utc(attempt["expires_at"]):
        result = _graded_result(database, attempt, timed_out=True)
        return jsonify(message="Time expired; the saved answers were submitted.", result=result), 409
    if question_id not in attempt["question_ids"]:
        return jsonify(message="That question is not part of this quiz."), 400
    result = database.attempts.update_one(
        {"_id": attempt_object_id, "status": "in_progress", "expires_at": {"$gt": now}},
        {"$set": {f"answers.{question_id}": selected_option, "updated_at": now}},
    )
    if not result.matched_count:
        refreshed = database.attempts.find_one({"_id": attempt_object_id})
        if refreshed and refreshed.get("status") == "in_progress" and _as_utc(refreshed["expires_at"]) <= now:
            graded = _graded_result(database, refreshed, timed_out=True)
            return jsonify(message="Time expired; the saved answers were submitted.", result=graded), 409
        return jsonify(message="This quiz was submitted before the answer could be saved."), 409
    return jsonify(message="Answer saved.")


@quizzes_bp.post("/student/quizzes/attempts/<attempt_id>/submit")
@roles_required("student")
def submit_quiz(attempt_id):
    attempt_object_id = parse_object_id(attempt_id)
    user_id = parse_object_id(get_jwt_identity())
    if attempt_object_id is None:
        return jsonify(message="Quiz attempt was not found."), 404
    database = get_database()
    attempt = database.attempts.find_one({
        "_id": attempt_object_id,
        "user_id": user_id,
        "assessment_type": "quiz",
    })
    if not attempt:
        return jsonify(message="Quiz attempt was not found."), 404
    if attempt["status"] == "submitted":
        return jsonify(result=_existing_result(attempt))
    timed_out = datetime.now(timezone.utc) >= _as_utc(attempt["expires_at"])
    return jsonify(result=_graded_result(database, attempt, timed_out=timed_out))


@quizzes_bp.get("/student/results")
@roles_required("student")
def student_results():
    user_id = parse_object_id(get_jwt_identity())
    database = get_database()
    now = datetime.now(timezone.utc)
    expired = database.attempts.find({
        "user_id": user_id,
        "assessment_type": "quiz",
        "status": "in_progress",
        "expires_at": {"$lte": now},
    })
    for attempt in expired:
        _graded_result(database, attempt, timed_out=True)
    attempts = database.attempts.find({
        "user_id": user_id,
        "assessment_type": {"$in": ["quiz", "test"]},
        "status": "submitted",
    }).sort("submitted_at", DESCENDING).limit(100)
    return jsonify(results=[_existing_result(item) for item in attempts])
