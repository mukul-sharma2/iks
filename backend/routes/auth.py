from datetime import datetime, timezone

from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt, get_jwt_identity, jwt_required
from pymongo.errors import DuplicateKeyError
from werkzeug.security import check_password_hash, generate_password_hash

from ..database import get_database
from ..middleware.auth import roles_required
from ..utils.responses import parse_object_id

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
AGE_GROUPS = {"10-13", "14-16", "17-19", "20+"}


def public_user(user):
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "age_group": user.get("age_group"),
        "is_active": user.get("is_active", True),
    }


@auth_bp.post("/register")
def register():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    raw_name = payload.get("name", "")
    raw_email = payload.get("email", "")
    name = raw_name.strip() if isinstance(raw_name, str) else ""
    email = raw_email.strip().lower() if isinstance(raw_email, str) else ""
    password = payload.get("password", "")
    age_group = payload.get("age_group", "14-16")
    if not name or len(name) > 80:
        return jsonify(message="Enter a name between 1 and 80 characters."), 400
    if not isinstance(password, str) or len(password) < 8 or len(password) > 128:
        return jsonify(message="Password must be between 8 and 128 characters."), 400
    if age_group not in AGE_GROUPS:
        return jsonify(message="Choose a valid age group."), 400
    try:
        email = validate_email(email, check_deliverability=False).normalized
    except (EmailNotValidError, TypeError):
        return jsonify(message="Enter a valid email address."), 400

    database = get_database()
    now = datetime.now(timezone.utc)
    user = {
        "name": name,
        "email": email,
        "password_hash": generate_password_hash(password),
        "role": "student",
        "age_group": age_group,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    try:
        result = database.users.insert_one(user)
    except DuplicateKeyError:
        return jsonify(message="An account with this email already exists."), 409
    user["_id"] = result.inserted_id
    token = create_access_token(identity=str(result.inserted_id), additional_claims={"role": "student"})
    return jsonify(access_token=token, user=public_user(user)), 201


@auth_bp.post("/login")
def login():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    raw_email = payload.get("email", "")
    email = raw_email.strip().lower() if isinstance(raw_email, str) else ""
    password = payload.get("password", "")
    if not email or not isinstance(password, str):
        return jsonify(message="Email and password are required."), 400
    user = get_database().users.find_one({"email": email})
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify(message="Email or password is incorrect."), 401
    if not user.get("is_active", True):
        return jsonify(message="This account is currently inactive. Please contact an administrator."), 403
    token = create_access_token(identity=str(user["_id"]), additional_claims={"role": user["role"]})
    return jsonify(access_token=token, user=public_user(user)), 200


@auth_bp.get("/me")
@jwt_required()
def me():
    claims = get_jwt()
    if get_database().blocked_tokens.find_one({"jti": claims["jti"]}):
        return jsonify(message="This session has ended. Please sign in again."), 401
    user_id = parse_object_id(get_jwt_identity())
    if user_id is None:
        return jsonify(message="This account is unavailable."), 401
    user = get_database().users.find_one({"_id": user_id, "is_active": True})
    if not user:
        return jsonify(message="This account is unavailable."), 401
    return jsonify(user=public_user(user))


@auth_bp.post("/logout")
@jwt_required()
def logout():
    claims = get_jwt()
    if get_database().blocked_tokens.find_one({"jti": claims["jti"]}):
        return jsonify(message="This session has already ended."), 200
    get_database().blocked_tokens.insert_one({
        "jti": claims["jti"],
        "expires_at": datetime.fromtimestamp(claims["exp"], timezone.utc),
        "created_at": datetime.now(timezone.utc),
    })
    return jsonify(message="You have signed out."), 200


@auth_bp.get("/admin-check")
@roles_required("admin")
def admin_check():
    return jsonify(message="Administrator access verified."), 200
