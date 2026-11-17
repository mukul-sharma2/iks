import os
import uuid
import zipfile
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_jwt_extended import get_jwt_identity
from pymongo import DESCENDING
from pymongo.errors import PyMongoError
from werkzeug.utils import secure_filename

from ..database import get_database
from ..middleware.auth import roles_required
from ..utils.responses import parse_object_id

materials_bp = Blueprint("materials", __name__, url_prefix="/api")
AGE_GROUPS = {"10-13", "14-16", "17-19", "20+"}
ALLOWED_TYPES = {
    ".pdf": ("application/pdf", "pdf"),
    ".doc": ("application/msword", "doc"),
    ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
}


def _public_material(material):
    return {
        "id": str(material["_id"]),
        "title": material["title"],
        "description": material.get("description", ""),
        "category_id": str(material["category_id"]),
        "category_name": material.get("category_name", ""),
        "period_id": str(material["period_id"]),
        "period_name": material.get("period_name", ""),
        "age_group": material["age_group"],
        "file_name": material["file_name"],
        "file_size": material["file_size"],
        "file_type": material["file_type"],
        "created_at": material["created_at"],
    }


def _valid_content(extension, header, upload):
    if extension == ".pdf":
        return header.startswith(b"%PDF-")
    if extension == ".doc":
        return header.startswith(bytes.fromhex("D0CF11E0A1B11AE1"))
    if extension == ".docx" and header.startswith(b"PK"):
        upload.stream.seek(0)
        try:
            with zipfile.ZipFile(upload.stream) as document:
                names = set(document.namelist())
                return "[Content_Types].xml" in names and "word/document.xml" in names
        except (OSError, zipfile.BadZipFile):
            return False
    return False


@materials_bp.get("/materials")
@roles_required("student", "admin")
def list_materials():
    query = {}
    for parameter, field in (("category_id", "category_id"), ("period_id", "period_id")):
        value = request.args.get(parameter)
        if value:
            object_id = parse_object_id(value)
            if object_id is None:
                return jsonify(message=f"Invalid {parameter}."), 400
            query[field] = object_id
    age_group = request.args.get("age_group")
    if age_group:
        if age_group not in AGE_GROUPS:
            return jsonify(message="Invalid age group."), 400
        query["age_group"] = age_group

    items = get_database().materials.find(query).sort("created_at", DESCENDING).limit(200)
    return jsonify(materials=[_public_material(item) for item in items])


@materials_bp.get("/materials/<material_id>")
@roles_required("student", "admin")
def get_material(material_id):
    object_id = parse_object_id(material_id)
    if object_id is None:
        return jsonify(message="Material was not found."), 404
    material = get_database().materials.find_one({"_id": object_id})
    if not material:
        return jsonify(message="Material was not found."), 404
    return jsonify(material=_public_material(material))


@materials_bp.get("/materials/<material_id>/download")
@roles_required("student", "admin")
def download_material(material_id):
    object_id = parse_object_id(material_id)
    if object_id is None:
        return jsonify(message="Material was not found."), 404
    material = get_database().materials.find_one({"_id": object_id})
    if not material:
        return jsonify(message="Material was not found."), 404
    stored_name = material.get("stored_filename", "")
    if not stored_name or os.path.basename(stored_name) != stored_name:
        current_app.logger.error("Material %s has an invalid stored filename", material_id)
        return jsonify(message="This file is unavailable. Please contact an administrator."), 500
    file_path = os.path.join(current_app.config["UPLOAD_FOLDER"], stored_name)
    if not os.path.isfile(file_path):
        return jsonify(message="The uploaded file is unavailable. Please contact an administrator."), 404
    return send_from_directory(
        current_app.config["UPLOAD_FOLDER"],
        stored_name,
        as_attachment=True,
        download_name=material["file_name"],
        mimetype=material["mime_type"],
        max_age=0,
    )


@materials_bp.post("/admin/materials")
@roles_required("admin")
def upload_material():
    upload = request.files.get("file")
    if not upload or not upload.filename:
        return jsonify(message="Choose a PDF, DOC or DOCX file to upload."), 400
    safe_original_name = secure_filename(upload.filename)
    if not safe_original_name:
        return jsonify(message="The uploaded filename is invalid."), 400
    extension = os.path.splitext(safe_original_name)[1].lower()
    if extension not in ALLOWED_TYPES:
        return jsonify(message="Only PDF, DOC and DOCX files are accepted."), 400

    payload = request.form
    title = payload.get("title", "").strip()
    description = payload.get("description", "").strip()
    category_id = parse_object_id(payload.get("category_id"))
    period_id = parse_object_id(payload.get("period_id"))
    age_group = payload.get("age_group", "")
    if not title or len(title) > 150:
        return jsonify(message="Enter a material title between 1 and 150 characters."), 400
    if len(description) > 2000:
        return jsonify(message="The description must be 2000 characters or fewer."), 400
    if not category_id or not period_id:
        return jsonify(message="Choose a valid knowledge category and historical period."), 400
    if age_group not in AGE_GROUPS:
        return jsonify(message="Choose a valid age group."), 400

    database = get_database()
    category = database.categories.find_one({"_id": category_id, "is_active": True})
    period = database.periods.find_one({"_id": period_id, "is_active": True})
    if not category or not period:
        return jsonify(message="The selected category or historical period is unavailable."), 400

    header = upload.stream.read(16)
    if not _valid_content(extension, header, upload):
        return jsonify(message="The file content does not match its PDF or document extension."), 400
    upload.stream.seek(0)
    file_bytes = upload.stream.read()
    if not file_bytes:
        return jsonify(message="The selected file is empty."), 400

    mime_type, file_type = ALLOWED_TYPES[extension]
    stored_filename = f"{uuid.uuid4().hex}{extension}"
    upload_folder = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_folder, exist_ok=True)
    destination = os.path.join(upload_folder, stored_filename)
    try:
        with open(destination, "xb") as stored_file:
            stored_file.write(file_bytes)
    except OSError:
        current_app.logger.exception("Failed to store uploaded material")
        return jsonify(message="The server could not save this file. Please try again."), 500

    now = datetime.now(timezone.utc)
    material = {
        "title": title,
        "description": description,
        "category_id": category_id,
        "category_name": category["name"],
        "period_id": period_id,
        "period_name": period["name"],
        "age_group": age_group,
        "file_name": safe_original_name,
        "stored_filename": stored_filename,
        "file_size": len(file_bytes),
        "file_type": file_type,
        "mime_type": mime_type,
        "created_by": parse_object_id(get_jwt_identity()),
        "created_at": now,
        "updated_at": now,
    }
    try:
        result = database.materials.insert_one(material)
    except PyMongoError:
        try:
            os.remove(destination)
        except OSError:
            current_app.logger.exception("Could not clean up an upload after database failure")
        raise
    material["_id"] = result.inserted_id
    return jsonify(material=_public_material(material)), 201


@materials_bp.put("/admin/materials/<material_id>")
@roles_required("admin")
def update_material(material_id):
    object_id = parse_object_id(material_id)
    if object_id is None:
        return jsonify(message="Material was not found."), 404
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(message="A JSON object is required."), 400
    title = payload.get("title", "")
    description = payload.get("description", "")
    category_id = parse_object_id(payload.get("category_id"))
    period_id = parse_object_id(payload.get("period_id"))
    age_group = payload.get("age_group", "")
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 150:
        return jsonify(message="Enter a material title between 1 and 150 characters."), 400
    if not isinstance(description, str) or len(description) > 2000:
        return jsonify(message="The description must be 2000 characters or fewer."), 400
    if not category_id or not period_id:
        return jsonify(message="Choose a valid knowledge category and historical period."), 400
    if age_group not in AGE_GROUPS:
        return jsonify(message="Choose a valid age group."), 400

    database = get_database()
    material = database.materials.find_one({"_id": object_id})
    if not material:
        return jsonify(message="Material was not found."), 404
    category = database.categories.find_one({"_id": category_id, "is_active": True})
    period = database.periods.find_one({"_id": period_id, "is_active": True})
    if not category or not period:
        return jsonify(message="The selected category or historical period is unavailable."), 400
    database.materials.update_one(
        {"_id": object_id},
        {"$set": {
            "title": title.strip(),
            "description": description.strip(),
            "category_id": category_id,
            "category_name": category["name"],
            "period_id": period_id,
            "period_name": period["name"],
            "age_group": age_group,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    material.update({
        "title": title.strip(),
        "description": description.strip(),
        "category_id": category_id,
        "category_name": category["name"],
        "period_id": period_id,
        "period_name": period["name"],
        "age_group": age_group,
    })
    return jsonify(material=_public_material(material))


@materials_bp.delete("/admin/materials/<material_id>")
@roles_required("admin")
def delete_material(material_id):
    object_id = parse_object_id(material_id)
    if object_id is None:
        return jsonify(message="Material was not found."), 404
    database = get_database()
    material = database.materials.find_one({"_id": object_id})
    if not material:
        return jsonify(message="Material was not found."), 404
    database.materials.delete_one({"_id": object_id})
    stored_name = material.get("stored_filename")
    if stored_name and os.path.basename(stored_name) == stored_name:
        try:
            os.remove(os.path.join(current_app.config["UPLOAD_FOLDER"], stored_name))
        except FileNotFoundError:
            current_app.logger.warning("Stored file for material %s was already missing", material_id)
    return jsonify(message="Material deleted.")
