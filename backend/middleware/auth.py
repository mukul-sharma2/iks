from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from ..database import get_database
from ..utils.responses import parse_object_id


def roles_required(*roles):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if get_database().blocked_tokens.find_one({"jti": claims["jti"]}):
                return jsonify(message="This session has ended. Please sign in again."), 401
            user = current_user()
            if not user:
                return jsonify(message="This account is unavailable."), 401
            if user.get("role") not in roles:
                return jsonify(message="You do not have permission to access this resource."), 403
            return view(*args, **kwargs)

        return wrapped

    return decorator


def current_user():
    user_id = parse_object_id(get_jwt_identity())
    if user_id is None:
        return None
    return get_database().users.find_one({"_id": user_id, "is_active": True})
