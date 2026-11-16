"""Interactive administrative commands for the Flask application."""

import click
from flask import current_app
from pymongo.errors import PyMongoError

from app.database.indexes import ensure_indexes
from app.database.mongo import get_database
from app.services.user_service import DuplicateUsernameError, create_user


def register_commands(app):
    """Register commands that need the application configuration."""

    @app.cli.command("create-manager")
    def create_manager():
        """Interactively create a manager account in MongoDB."""
        config = current_app.config
        if not config.get("JWT_SECRET_KEY"):
            raise click.ClickException("JWT_SECRET_KEY belum dikonfigurasi.")

        name = click.prompt("Nama manager", type=str).strip()
        username = click.prompt("Username manager", type=str).strip().lower()
        if not name or not username:
            raise click.ClickException("Nama dan username wajib diisi.")

        password = click.prompt(
            "Password manager",
            hide_input=True,
            confirmation_prompt="Ulangi password manager",
        )

        try:
            database = get_database(
                config.get("MONGO_URI"),
                config.get("MONGO_DB_NAME"),
                config.get("MONGO_SERVER_SELECTION_TIMEOUT_MS", 5000),
            )
            ensure_indexes(database)
            create_user(
                database["users"],
                {
                    "name": name,
                    "username": username,
                    "password": password,
                    "role": "manager",
                },
                config.get("BCRYPT_ROUNDS", 12),
            )
        except DuplicateUsernameError as error:
            raise click.ClickException(str(error)) from error
        except ValueError as error:
            raise click.ClickException(
                f"Gagal membuat akun manager: {error}"
            ) from error
        except PyMongoError as error:
            raise click.ClickException(
                "Gagal terhubung atau menyimpan ke MongoDB. Periksa koneksi dan akses database."
            ) from error

        click.echo(f"Akun manager '{username}' berhasil dibuat.")
