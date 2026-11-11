"""Application factory for the Ritely POS API."""

from flask import Flask, jsonify

from app.config import Config
from app.controllers.health import health_bp


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)
    app.register_blueprint(health_bp)

    @app.get("/")
    def index():
        return jsonify(
            service="Ritely POS API",
            status="running",
            database_check="/api/health/db",
        )

    return app

