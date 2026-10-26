import os
from urllib.parse import quote_plus

from dotenv import load_dotenv

# Load variables from a .env file (if present) into the environment
load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    """Base configuration, values pulled from environment variables."""

    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")

    # --- MySQL connection settings ---
    DB_USER = os.environ.get("DB_USER", "root")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
    DB_HOST = os.environ.get("DB_HOST", "localhost")
    DB_PORT = os.environ.get("DB_PORT", "3306")
    DB_NAME = os.environ.get("DB_NAME", "localbites")

    # quote_plus escapes special characters (@, :, /, etc.) so a password
    # containing them doesn't break the connection URL's structure.
    _SAFE_PASSWORD = quote_plus(DB_PASSWORD)

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{DB_USER}:{_SAFE_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # --- Admin panel ---
    # The URL path is intentionally NOT something guessable like /admin,
    # and it's never linked from anywhere in the public UI. Real
    # authentication (admin_login_required) is still the actual security
    # control — this is just an extra layer that keeps casual visitors
    # from even finding a login form to try.
    ADMIN_URL_PREFIX = "/portal-admin-x7k2"

    # --- File uploads (business verification documents) ---
    # Stored outside static/ on purpose: these are private ID/ownership
    # documents and must never be reachable via a public /static/ URL.
    UPLOAD_FOLDER = os.path.join(BASE_DIR, "instance", "uploads", "business_docs")
    BUSINESS_LOGO_UPLOAD_FOLDER = os.path.join(BASE_DIR, "instance", "uploads", "business_logos")
    ALLOWED_DOC_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
    MAX_DOC_SIZE_MB = 5
    # Hard cap on the whole request body (4 docs x 5MB + form fields, with room to spare)
    MAX_CONTENT_LENGTH = 25 * 1024 * 1024

    # --- Outgoing email (used to send OTP codes) ---
    # Uses whatever SMTP relay is configured in .env — Brevo's free tier
    # (smtp-relay.brevo.com) by default, since it doesn't require an "app
    # password" the way Gmail does and works on any Google account type.
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp-relay.brevo.com")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")  # the Brevo SMTP key
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", MAIL_USERNAME)

    # --- Payments (Razorpay) ---
    # Test-mode keys from your Razorpay dashboard (Settings > API Keys).
    # Leave unset during development — the payment page will tell the
    # customer online payment isn't configured yet and fall back to
    # Cash on Delivery, rather than erroring.
    RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID")
    RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET")