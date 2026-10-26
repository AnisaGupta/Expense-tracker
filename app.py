from flask import Flask

from config import Config
from extensions import db, migrate, login_manager, mail
from routes.main import main_bp
from routes.customer import customer_bp
from routes.business import business_bp
from routes.auth_shared import auth_bp
from routes.admin import admin_bp
from routes.delivery import delivery_bp

# Import models so Flask-Migrate can detect them for autogenerating migrations
from models import (  # noqa: F401
    Customer,
    Admin,
    Business,
    Category,
    MenuItem,
    Cart,
    CartItem,
    Order,
    OrderItem,
    Payment,
    Review,
    OrderStatusHistory,
    OTPVerification,
)

# Registers the user_loader + pulls in the login-required decorators used
# by the route modules. Must come after the models import above.
import auth  # noqa: F401,E402


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    mail.init_app(app)

    app.register_blueprint(main_bp)
    app.register_blueprint(customer_bp)
    app.register_blueprint(business_bp)
    app.register_blueprint(auth_bp)
    # The hidden path lives in config/.env, not here — see Config.ADMIN_URL_PREFIX.
    app.register_blueprint(admin_bp, url_prefix=app.config["ADMIN_URL_PREFIX"])
    app.register_blueprint(delivery_bp)

    return app


app = create_app()


@app.cli.command("create-admin")
def create_admin():
    """
    Create an Admin account directly in the database.

    Run with: python -m flask create-admin
    This is the ONLY way to create an admin account — there is no
    web-facing registration form for admins, on purpose.
    """
    import getpass
    from extensions import db
    from models import Admin

    username = input("Admin username: ").strip()
    if not username:
        print("Username can't be empty. Aborted.")
        return

    with app.app_context():
        if Admin.query.filter_by(username=username).first():
            print(f"An admin with username '{username}' already exists. Aborted.")
            return

        password = getpass.getpass("Admin password: ")
        confirm = getpass.getpass("Confirm password: ")

        if len(password) < 8:
            print("Password must be at least 8 characters. Aborted.")
            return
        if password != confirm:
            print("Passwords didn't match. Aborted.")
            return

        admin = Admin(username=username)
        admin.set_password(password)
        db.session.add(admin)
        db.session.commit()
        print(f"Admin account '{username}' created successfully.")


if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)
