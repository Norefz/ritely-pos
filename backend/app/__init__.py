"""Application factory for the Ritely POS web app and API."""

from pathlib import Path

from flask import Flask, abort, jsonify, send_from_directory
from flask_cors import CORS

from app.config import Config
from app.controllers.auth import auth_bp
from app.controllers.health import health_bp
from app.controllers.shifts import shifts_bp
from app.controllers.users import users_bp


def create_app(config_object=Config):
    app = Flask(__name__)
    frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
    app.config.from_object(config_object)
    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": app.config.get(
                    "CORS_ALLOWED_ORIGINS",
                    ["http://localhost:8080", "http://127.0.0.1:8080"],
                )
            }
        },
        allow_headers=["Authorization", "Content-Type"],
        methods=["GET", "POST", "PATCH", "OPTIONS"],
    )
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(shifts_bp)
    app.register_blueprint(users_bp)

    @app.get("/")
    def index():
        if frontend_dir.is_dir():
            return send_from_directory(frontend_dir, "index.html")
        return jsonify(service="Ritely POS API", status="running")

    @app.get("/<path:asset_path>")
    def frontend_asset(asset_path):
        if asset_path == "api" or asset_path.startswith("api/"):
            abort(404)
        return send_from_directory(frontend_dir, asset_path)

    return app

