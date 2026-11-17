from bson import ObjectId
from bson.errors import InvalidId


def serialize_value(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {
            "id" if key == "_id" else key: serialize_value(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [serialize_value(item) for item in value]
    return value


def parse_object_id(value):
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None
