from datetime import datetime, timezone

from flask import Blueprint, jsonify

from ..database import get_database
from ..utils.responses import serialize_value

catalog_bp = Blueprint("catalog", __name__, url_prefix="/api")

PERIODS = [
    {"seed_key": "ancient-india", "name": "Ancient India", "order": 1, "description": "From early urban civilisations through the Gupta age.", "subperiods": ["Indus Valley Civilization", "Vedic Period", "Maurya Empire", "Gupta Empire"]},
    {"seed_key": "medieval-india", "name": "Medieval India", "order": 2, "description": "Centuries of cultural exchange, new institutions and devotional movements.", "subperiods": ["Delhi Sultanate", "Mughal Period", "Bhakti Movement", "Sufi Movement"]},
    {"seed_key": "modern-india", "name": "Modern India", "order": 3, "description": "A period of reform, renewal and the struggle for independence.", "subperiods": ["Colonial Period", "Indian Renaissance", "Freedom Movement"]},
]

DOMAINS = [
    "Indian Mathematics", "Astronomy", "Ayurveda", "Yoga", "Indian Philosophy",
    "Sanskrit Literature", "Architecture", "Agriculture", "Metallurgy", "Education Systems",
]

TIMELINE_SEEDS = [
    {
        "seed_key": "timeline-indus-valley",
        "period_key": "ancient-india",
        "subperiod": "Indus Valley Civilization",
        "entry_type": "civilization",
        "title": "Indus Valley Civilisation",
        "date_range": "c. 2600–1900 BCE",
        "overview": "Planned cities, craft traditions and systems of measurement reveal sophisticated urban life.",
        "order": 1,
    },
    {
        "seed_key": "timeline-vedic-traditions",
        "period_key": "ancient-india",
        "subperiod": "Vedic Period",
        "entry_type": "movement",
        "title": "Vedic traditions",
        "date_range": "c. 1500–500 BCE",
        "overview": "An evolving body of oral literature, ritual practice, reflection and debate takes shape.",
        "order": 2,
    },
    {
        "seed_key": "timeline-maurya-empire",
        "period_key": "ancient-india",
        "subperiod": "Maurya Empire",
        "entry_type": "kingdom",
        "title": "Maurya Empire",
        "date_range": "c. 322–185 BCE",
        "overview": "Political thought and public life find new expression across a vast and connected realm.",
        "order": 3,
    },
    {
        "seed_key": "timeline-gupta-age",
        "period_key": "ancient-india",
        "subperiod": "Gupta Empire",
        "entry_type": "civilization",
        "title": "Gupta age",
        "date_range": "c. 320–550 CE",
        "overview": "Mathematics, astronomy, literature and the arts flourish in a period of rich exchange.",
        "order": 4,
    },
    {
        "seed_key": "timeline-medieval-india",
        "period_key": "medieval-india",
        "subperiod": "",
        "entry_type": "other",
        "title": "Medieval India",
        "date_range": "8th–18th century",
        "overview": "New institutions, languages and movements transform scholarship, devotion and culture.",
        "order": 5,
    },
    {
        "seed_key": "timeline-changing-india",
        "period_key": "modern-india",
        "subperiod": "",
        "entry_type": "other",
        "title": "A changing India",
        "date_range": "19th–20th century",
        "overview": "Reformers, educators and freedom movements reshape public thought and learning.",
        "order": 6,
    },
]


@catalog_bp.get("/categories")
def categories():
    database = get_database()
    seed_catalog(database)
    items = list(database.categories.find({"is_active": True}).sort("name", 1))
    return jsonify(categories=[serialize_value(item) for item in items])


@catalog_bp.get("/periods")
def periods():
    database = get_database()
    seed_catalog(database)
    items = list(database.periods.find({"is_active": True}).sort("order", 1))
    return jsonify(periods=[serialize_value(item) for item in items])


@catalog_bp.get("/announcements")
def announcements():
    items = get_database().announcements.find({"is_published": True}).sort("created_at", -1).limit(10)
    return jsonify(announcements=[serialize_value(item) for item in items])


def seed_catalog(database):
    now = datetime.now(timezone.utc)
    for period in PERIODS:
        existing = database.periods.find_one({"seed_key": period["seed_key"]})
        if not existing:
            existing = database.periods.find_one({"name": period["name"], "seed_key": {"$exists": False}})
        if existing:
            database.periods.update_one(
                {"_id": existing["_id"]},
                {"$set": {"seed_key": period["seed_key"]}},
            )
        else:
            database.periods.insert_one({
                **period, "is_active": True, "created_at": now, "updated_at": now,
            })
    for name in DOMAINS:
        database.categories.update_one(
            {"name": name, "parent_id": None},
            {"$setOnInsert": {"name": name, "description": "", "parent_id": None, "is_active": True, "created_at": now, "updated_at": now}},
            upsert=True,
        )
    for entry in TIMELINE_SEEDS:
        if database.timeline_entries.find_one({"seed_key": entry["seed_key"]}):
            continue
        period = database.periods.find_one({"seed_key": entry["period_key"]})
        if not period:
            continue
        database.timeline_entries.insert_one({
            **entry,
            "period_id": period["_id"],
            "period_name": period["name"],
            "region": "",
            "capital": "",
            "leaders": "",
            "achievements": "",
            "legacy": "",
            "is_published": True,
            "is_deleted": False,
            "created_at": now,
            "updated_at": now,
        })
