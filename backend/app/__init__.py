"""Application factory for the Ritely POS API."""

from flask import Flask, jsonify

from app.config import Config
from app.controllers.auth import auth_bp
from app.controllers.health import health_bp
from app.controllers.users import users_bp


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)
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

