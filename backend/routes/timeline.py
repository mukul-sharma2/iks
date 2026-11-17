from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from ..database import get_database
from ..middleware.auth import roles_required
from ..utils.responses import parse_object_id, serialize_value
from .catalog import seed_catalog

timeline_bp = Blueprint("timeline", __name__, url_prefix="/api")
ENTRY_TYPES = {"civilization", "kingdom", "event", "movement", "institution", "other"}


def _text(payload, field, limit, required=False):
    value = payload.get(field, "")
    if not isinstance(value, str) or len(value.strip()) > limit:
        return None
    value = value.strip()
    return value if value or not required else None


def _validate_period(payload):
    name = _text(payload, "name", 100, required=True)
    date_range = _text(payload, "date_range", 100)
    era = _text(payload, "era", 80)
    description = _text(payload, "description", 2000, required=True)
    subperiods = payload.get("subperiods")
    order = payload.get("order")
    is_active = payload.get("is_active", True)

    if not name or date_range is None or era is None or description is None:
        return None, "Enter a period name, and keep text fields within their length limits."
    if not isinstance(subperiods, list) or len(subperiods) > 50:
        return None, "Subperiods must be a list of up to 50 names."
    cleaned_subperiods = []
    seen_subperiods = set()
    for subperiod in subperiods:
        if not isinstance(subperiod, str) or not subperiod.strip() or len(subperiod.strip()) > 100:
            return None, "Each subperiod must have a name of 1 to 100 characters."
        cleaned = subperiod.strip()
        if cleaned.casefold() in seen_subperiods:
            return None, "Subperiod names must be unique within a period."
        seen_subperiods.add(cleaned.casefold())
        cleaned_subperiods.append(cleaned)
    if isinstance(order, bool) or not isinstance(order, int) or not 0 <= order <= 10000:
        return None, "Order must be a whole number between 0 and 10000."
    if not isinstance(is_active, bool):
        return None, "is_active must be true or false."

    return {
        "name": name,
        "date_range": date_range,
        "era": era,
        "description": description,
        "subperiods": cleaned_subperiods,
        "order": order,
        "is_active": is_active,
    }, None


def _validate_entry(payload, database):
    period_id = parse_object_id(payload.get("period_id"))
    title = _text(payload, "title", 120, required=True)
    entry_type = payload.get("entry_type")
    date_range = _text(payload, "date_range", 100, required=True)
    subperiod = _text(payload, "subperiod", 100)
    region = _text(payload, "region", 200)
    capital = _text(payload, "capital", 120)
    leaders = _text(payload, "leaders", 500)
    overview = _text(payload, "overview", 4000, required=True)
    achievements = _text(payload, "achievements", 3000)
    legacy = _text(payload, "legacy", 3000)
    raw_subperiods = payload.get("subperiods", [])
    order = payload.get("order", 0)
    is_published = payload.get("is_published", True)

    if not period_id or not title or not date_range or not overview:
        return None, "Choose a period and provide a title, date range, and overview."
    if not isinstance(entry_type, str) or entry_type not in ENTRY_TYPES:
        return None, "Choose a valid historical entry type."
    if any(value is None for value in (subperiod, region, capital, leaders, achievements, legacy)):
        return None, "One or more text fields exceed their length limits."
    if not isinstance(raw_subperiods, list) or len(raw_subperiods) > 30:
        return None, "A historical profile can have up to 30 specific subperiods."
    specific_subperiods = []
    seen_names = set()
    for item in raw_subperiods:
        if not isinstance(item, dict):
            return None, "Each specific subperiod must be an object with a name."
        name = _text(item, "name", 100, required=True)
        date = _text(item, "date_range", 100)
        description = _text(item, "description", 2000)
        if not name or date is None or description is None:
            return None, "Enter a subperiod name and keep its text fields within their length limits."
        if name.casefold() in seen_names:
            return None, "Specific subperiod names must be unique within a historical profile."
        seen_names.add(name.casefold())
        specific_subperiods.append({
            "name": name,
            "date_range": date,
            "description": description,
        })
    if isinstance(order, bool) or not isinstance(order, int) or not 0 <= order <= 10000:
        return None, "Order must be a whole number between 0 and 10000."
    if not isinstance(is_published, bool):
        return None, "is_published must be true or false."

    period = database.periods.find_one({"_id": period_id, "is_active": True})
    if not period:
        return None, "The selected historical period is unavailable."
    if subperiod and subperiod not in period.get("subperiods", []):
        return None, "Choose a subperiod belonging to the selected historical period."

    return {
        "period_id": period_id,
        "period_name": period["name"],
        "subperiod": subperiod,
        "entry_type": entry_type,
        "title": title,
        "date_range": date_range,
        "region": region,
        "capital": capital,
        "leaders": leaders,
        "overview": overview,
        "achievements": achievements,
        "legacy": legacy,
        "subperiods": specific_subperiods,
        "order": order,
        "is_published": is_published,
    }, None


@timeline_bp.get("/timeline")
def public_timeline():
    database = get_database()
    seed_catalog(database)
    periods = list(database.periods.find({"is_active": True}).sort("order", 1))
    period_ids = [period["_id"] for period in periods]
    entries = database.timeline_entries.find({
        "period_id": {"$in": period_ids},
        "is_published": True,
        "is_deleted": {"$ne": True},
    }).sort([("order", 1), ("title", 1)])
    return jsonify(
        periods=[serialize_value(period) for period in periods],
        entries=[serialize_value(entry) for entry in entries],
    )


@timeline_bp.get("/admin/timeline")
@roles_required("admin")
def admin_timeline():
    database = get_database()
    seed_catalog(database)
    periods = database.periods.find({}).sort("order", 1)
    entries = database.timeline_entries.find({"is_deleted": {"$ne": True}}).sort([("period_name", 1), ("order", 1), ("title", 1)])
    return jsonify(
        periods=[serialize_value(period) for period in periods],
        entries=[serialize_value(entry) for entry in entries],
    )


@timeline_bp.post("/admin/timeline/periods")
@roles_required("admin")
def create_period():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    period, error = _validate_period(payload)
    if error:
        return jsonify(message=error), 400
    database = get_database()
    if database.periods.find_one({"name": period["name"]}):
        return jsonify(message="A historical period with this name already exists."), 409
    now = datetime.now(timezone.utc)
    period.update({"created_at": now, "updated_at": now})
    result = database.periods.insert_one(period)
    period["_id"] = result.inserted_id
    return jsonify(period=serialize_value(period)), 201


@timeline_bp.put("/admin/timeline/periods/<period_id>")
@roles_required("admin")
def update_period(period_id):
    object_id = parse_object_id(period_id)
    if object_id is None:
        return jsonify(message="Historical period was not found."), 404
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    period, error = _validate_period(payload)
    if error:
        return jsonify(message=error), 400
    database = get_database()
    existing = database.periods.find_one({"_id": object_id})
    if not existing:
        return jsonify(message="Historical period was not found."), 404
    if database.periods.find_one({"_id": {"$ne": object_id}, "name": period["name"]}):
        return jsonify(message="A historical period with this name already exists."), 409

    old_subperiods = set(existing.get("subperiods", []))
    removed_subperiods = old_subperiods.difference(period["subperiods"])
    if removed_subperiods and database.timeline_entries.find_one({
        "period_id": object_id,
        "subperiod": {"$in": list(removed_subperiods)},
        "is_deleted": {"$ne": True},
    }):
        return jsonify(message="A subperiod is used by a historical entry. Reassign or remove that entry first."), 409

    database.periods.update_one(
        {"_id": object_id},
        {"$set": {**period, "updated_at": datetime.now(timezone.utc)}},
    )
    if existing.get("name") != period["name"]:
        for collection in ("timeline_entries", "materials", "quizzes", "tests"):
            database[collection].update_many(
                {"period_id": object_id},
                {"$set": {"period_name": period["name"]}},
            )
    return jsonify(period=serialize_value({**existing, **period, "_id": object_id}))


@timeline_bp.post("/admin/timeline/entries")
@roles_required("admin")
def create_entry():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    database = get_database()
    entry, error = _validate_entry(payload, database)
    if error:
        return jsonify(message=error), 400
    now = datetime.now(timezone.utc)
    entry.update({"created_at": now, "updated_at": now})
    result = database.timeline_entries.insert_one(entry)
    entry["_id"] = result.inserted_id
    return jsonify(entry=serialize_value(entry)), 201


@timeline_bp.put("/admin/timeline/entries/<entry_id>")
@roles_required("admin")
def update_entry(entry_id):
    object_id = parse_object_id(entry_id)
    if object_id is None:
        return jsonify(message="Historical entry was not found."), 404
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    database = get_database()
    if not database.timeline_entries.find_one({"_id": object_id, "is_deleted": {"$ne": True}}):
        return jsonify(message="Historical entry was not found."), 404
    entry, error = _validate_entry(payload, database)
    if error:
        return jsonify(message=error), 400
    database.timeline_entries.update_one(
        {"_id": object_id},
        {"$set": {**entry, "updated_at": datetime.now(timezone.utc)}},
    )
    return jsonify(entry=serialize_value({**entry, "_id": object_id}))


@timeline_bp.delete("/admin/timeline/periods/<period_id>")
@roles_required("admin")
def archive_period(period_id):
    object_id = parse_object_id(period_id)
    if object_id is None:
        return jsonify(message="Historical period was not found."), 404
    result = get_database().periods.update_one(
        {"_id": object_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
    )
    if not result.matched_count:
        return jsonify(message="Historical period was not found."), 404
    return jsonify(message="Historical period archived. Its content and learning records were kept.")


@timeline_bp.patch("/admin/timeline/periods/<period_id>/restore")
@roles_required("admin")
def restore_period(period_id):
    object_id = parse_object_id(period_id)
    if object_id is None:
        return jsonify(message="Historical period was not found."), 404
    result = get_database().periods.update_one(
        {"_id": object_id},
        {"$set": {"is_active": True, "updated_at": datetime.now(timezone.utc)}},
    )
    if not result.matched_count:
        return jsonify(message="Historical period was not found."), 404
    return jsonify(message="Historical period restored.")


@timeline_bp.delete("/admin/timeline/entries/<entry_id>")
@roles_required("admin")
def delete_entry(entry_id):
    object_id = parse_object_id(entry_id)
    if object_id is None:
        return jsonify(message="Historical entry was not found."), 404
    collection = get_database().timeline_entries
    entry = collection.find_one({"_id": object_id, "is_deleted": {"$ne": True}})
    if not entry:
        return jsonify(message="Historical entry was not found."), 404
    if entry.get("seed_key"):
        collection.update_one(
            {"_id": object_id},
            {"$set": {"is_deleted": True, "is_published": False, "updated_at": datetime.now(timezone.utc)}},
        )
    else:
        collection.delete_one({"_id": object_id})
    return jsonify(message="Historical entry deleted.")
