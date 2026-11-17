import os

import click
from dotenv import load_dotenv
from datetime import datetime, timezone

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from pymongo.errors import DuplicateKeyError, PyMongoError
from werkzeug.security import generate_password_hash

from .config import Config
from .database import close_database, ensure_indexes, get_database
from .routes.admin import admin_bp
from .routes.auth import auth_bp
from .routes.catalog import catalog_bp, seed_catalog
from .routes.materials import materials_bp
from .routes.quizzes import quizzes_bp
from .routes.student import student_bp
from .routes.tests import tests_bp
from .routes.timeline import timeline_bp

jwt = JWTManager()


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)
    if not app.config.get("JWT_SECRET_KEY"):
        raise RuntimeError("JWT_SECRET_KEY must be configured. Copy backend/.env.example to backend/.env and set a secret.")

    CORS(app, resources={r"/api/*": {"origins": app.config["FRONTEND_ORIGIN"]}}, supports_credentials=False)
    jwt.init_app(app)
    app.teardown_appcontext(close_database)
    app.register_blueprint(auth_bp)
    app.register_blueprint(catalog_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(materials_bp)
    app.register_blueprint(quizzes_bp)
    app.register_blueprint(student_bp)
    app.register_blueprint(tests_bp)
    app.register_blueprint(timeline_bp)

    @app.errorhandler(413)
    def request_too_large(_error):
        return jsonify(message="The uploaded file exceeds the 16 MB limit."), 413

    @jwt.token_in_blocklist_loader
    def is_token_revoked(_jwt_header, jwt_payload):
        try:
            return get_database().blocked_tokens.find_one({"jti": jwt_payload["jti"]}) is not None
        except PyMongoError:
            app.logger.exception("Unable to verify JWT revocation state")
            return True

    @app.get("/api/health")
    def health():
        try:
            database = get_database()
            database.command("ping")
            ensure_indexes(database)
            seed_catalog(database)
        except PyMongoError:
            app.logger.exception("MongoDB health check failed")
            return jsonify(status="error", message="Database is unavailable."), 503
        return jsonify(status="ok", service="IKS API", database="connected")

    @app.cli.command("create-admin")
    def create_admin():
        """Create the initial administrator using credentials from backend/.env."""
        from email_validator import EmailNotValidError, validate_email

        email = os.getenv("ADMIN_EMAIL", "").strip()
        password = os.getenv("ADMIN_PASSWORD", "")
        name = os.getenv("ADMIN_NAME", "IKS Administrator").strip()
        if not email or not password or password.startswith("replace-with-"):
            raise click.ClickException("Set ADMIN_EMAIL and a unique ADMIN_PASSWORD in backend/.env first.")
        if len(password) < 12:
            raise click.ClickException("ADMIN_PASSWORD must contain at least 12 characters.")
        if not name or len(name) > 80:
            raise click.ClickException("ADMIN_NAME must contain between 1 and 80 characters.")
        try:
            email = validate_email(email, check_deliverability=False).normalized
        except (EmailNotValidError, TypeError) as error:
            raise click.ClickException("ADMIN_EMAIL must be a valid email address.") from error

        database = get_database()
        ensure_indexes(database)
        if database.users.find_one({"role": "admin"}):
            raise click.ClickException("An administrator already exists. This command will not replace admin credentials.")
        now = datetime.now(timezone.utc)
        try:
            database.users.insert_one({
                "name": name,
                "email": email,
                "password_hash": generate_password_hash(password),
                "role": "admin",
                "age_group": None,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            })
        except DuplicateKeyError as error:
            raise click.ClickException("That email already belongs to an account. Use a different ADMIN_EMAIL.") from error
        click.echo(f"Administrator account created for {email}. You can now sign in at /login.")

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG") == "1")
