"""Application factory for the Ritely POS API."""

from flask import Flask, jsonify
from flask_cors import CORS

from app.config import Config
from app.controllers.auth import auth_bp
from app.controllers.health import health_bp
from app.controllers.users import users_bp


def create_app(config_object=Config):
    app = Flask(__name__)
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
    app.register_blueprint(users_bp)

    @app.get("/")
    def index():
        return jsonify(
            service="Ritely POS API",
            status="running",
            database_check="/api/health/db",
        )

    return app

