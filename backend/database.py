from flask import current_app, g
from pymongo import ASCENDING, MongoClient


def get_database():
    if "mongo_database" not in g:
        client = MongoClient(current_app.config["MONGODB_URI"], serverSelectionTimeoutMS=3000)
        g.mongo_client = client
        g.mongo_database = client[current_app.config["MONGODB_DB"]]
    return g.mongo_database


def close_database(_error=None):
    client = g.pop("mongo_client", None)
    if client is not None:
        client.close()


def ensure_indexes(database):
    database.users.create_index([("email", ASCENDING)], unique=True)
    database.users.create_index([("role", ASCENDING), ("is_active", ASCENDING)])
    database.blocked_tokens.create_index([("jti", ASCENDING)], unique=True)
    database.blocked_tokens.create_index("expires_at", expireAfterSeconds=0)
    database.categories.create_index([("parent_id", ASCENDING), ("name", ASCENDING)])
    database.periods.create_index([("is_active", ASCENDING), ("order", ASCENDING)])
    database.timeline_entries.create_index([("period_id", ASCENDING), ("is_published", ASCENDING), ("order", ASCENDING)])
    database.announcements.create_index([("is_published", ASCENDING), ("created_at", -1)])
    database.materials.create_index([("category_id", ASCENDING), ("period_id", ASCENDING), ("age_group", ASCENDING)])
    database.materials.create_index([("created_at", -1)])
    database.quizzes.create_index([("is_active", ASCENDING), ("age_group", ASCENDING), ("created_at", -1)])
    database.tests.create_index([("is_active", ASCENDING), ("age_group", ASCENDING), ("scheduled_at", ASCENDING)])
    database.questions.create_index([("quiz_id", ASCENDING), ("order", ASCENDING)])
    database.attempts.create_index([("user_id", ASCENDING), ("status", ASCENDING), ("submitted_at", -1)])
    database.attempts.create_index([("assessment_id", ASCENDING), ("status", ASCENDING)])
