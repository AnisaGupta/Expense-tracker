"""
Routes for the business side of LocalBites:
login/register, dashboard, menu management, orders,
delivery, profile and reviews.
"""
from werkzeug.security import generate_password_hash
from sqlalchemy.exc import IntegrityError
import os
import uuid
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo

from flask import (
    Blueprint,
    render_template,
    request,
    jsonify,
    redirect,
    url_for,
    current_app,
    send_from_directory
)

from flask_login import login_user, logout_user, current_user
from werkzeug.utils import secure_filename
from geopy.geocoders import Nominatim

from extensions import db

from models import (
    Business,
    MenuItem,
    Category,
    OrderDeliveryLocation,
    Order,
    OrderStatusHistory,
    DeliveryPerson,
    Review,
)

from models.business import BUSINESS_TYPES
from auth import business_login_required
from otp_service import has_recent_verified_otp


# ============================================================
# GEOCODER
# ============================================================

geolocator = Nominatim(user_agent="LocalBitesApp")

business_bp = Blueprint(
    "business",
    __name__,
    url_prefix="/business"
)


# ============================================================
# BUSINESS DATA HELPER
# ============================================================

def _real_business_data(business):
    """
    Serialize the logged-in business's real DB fields
    for the dashboard JS.
    """

    return {
        "businessId": business.business_id,
        "name": business.business_name,
        "owner": business.owner_name,
        "email": business.email,
        "phone": business.phone,
        "type": business.business_type,
        "description": business.description or "",
        "logoUrl": (url_for("business.business_logo", filename=business.logo_path) if business.logo_path else ""),
        "address": business.address or "",
        "city": getattr(business, "city", "") or "",
        "pincode": getattr(business, "pincode", "") or "",

        "services": {
            "delivery": business.delivery_available,
            "selfPickup": business.self_pickup_available
        },

        "latitude": (
            str(business.latitude)
            if business.latitude is not None
            else ""
        ),

        "longitude": (
            str(business.longitude)
            if business.longitude is not None
            else ""
        ),

        # Keep the raw HH:MM values in sync with the <input type="time">
        # fields on the business profile page.
        "opening_time": (
            business.opening_time.strftime("%H:%M")
            if business.opening_time
            else ""
        ),
        "closing_time": (
            business.closing_time.strftime("%H:%M")
            if business.closing_time
            else ""
        ),

        "hours": (
            f"{business.opening_time.strftime('%I:%M %p')} - "
            f"{business.closing_time.strftime('%I:%M %p')}"
            if business.opening_time and business.closing_time
            else ""
        ),

        "verificationStatus": (
            "approved"
            if business.status == "active"
            else "pending"
        ),
    }


# ============================================================
# JSON / FORM HELPER
# ============================================================

def _json_body():
    """
    Accept either JSON or classic form-encoded submissions.
    """

    data = request.get_json(silent=True)

    if data is None:
        data = request.form

    return data


# ============================================================
# BUSINESS DOCUMENT UPLOAD
# ============================================================

def _save_business_doc(file_storage, doc_label, subfolder):
    """
    Validate and save one uploaded business verification document.
    """

    if file_storage is None or not file_storage.filename:
        raise ValueError(
            f"Please upload the {doc_label}."
        )

    ext = os.path.splitext(
        file_storage.filename
    )[1].lower()

    allowed = current_app.config[
        "ALLOWED_DOC_EXTENSIONS"
    ]

    if ext not in allowed:
        raise ValueError(
            f"{doc_label}: unsupported file type. "
            f"Allowed: "
            f"{', '.join(sorted(e.lstrip('.').upper() for e in allowed))}"
        )

    # Check file size
    file_storage.stream.seek(0, os.SEEK_END)

    size_bytes = file_storage.stream.tell()

    file_storage.stream.seek(0)

    max_bytes = (
        current_app.config["MAX_DOC_SIZE_MB"]
        * 1024
        * 1024
    )

    if size_bytes > max_bytes:
        raise ValueError(
            f"{doc_label}: file is too large "
            f"(max {current_app.config['MAX_DOC_SIZE_MB']} MB)."
        )

    target_dir = os.path.join(
        current_app.config["UPLOAD_FOLDER"],
        subfolder
    )

    os.makedirs(
        target_dir,
        exist_ok=True
    )

    safe_name = secure_filename(
        file_storage.filename
    )

    unique_name = (
        f"{uuid.uuid4().hex}_{safe_name}"
    )

    file_storage.save(
        os.path.join(
            target_dir,
            unique_name
        )
    )

    return f"{subfolder}/{unique_name}"


# ============================================================
# LOGIN
# ============================================================

@business_bp.route("/login", methods=["GET"])
def login():

    if (
        current_user.is_authenticated
        and isinstance(current_user, Business)
    ):
        return redirect(
            url_for("business.dashboard")
        )

    return render_template(
        "business/login.html"
    )


@business_bp.route("/login", methods=["POST"])
def login_submit():

    data = _json_body()

    identifier = (
        data.get("username") or ""
    ).strip()

    password = (
        data.get("password") or ""
    )

    if not identifier or not password:
        return jsonify(
            success=False,
            message=(
                "Please enter your username "
                "and password."
            )
        ), 400

    business = Business.query.filter(
        (Business.username == identifier)
        |
        (Business.email == identifier.lower())
    ).first()

    if (
        not business
        or not business.check_password(password)
    ):
        return jsonify(
            success=False,
            message="Invalid username or password."
        ), 401

    if business.status != "active":

        return jsonify(
            success=False,
            message=(
                "Your business account is still "
                "pending admin verification."
            )
        ), 403

    login_user(business)

    return jsonify(
        success=True,
        redirect=url_for("business.dashboard")
    )


# ============================================================
# REGISTER
# ============================================================

@business_bp.route("/register", methods=["GET"])
def register():

    if (
        current_user.is_authenticated
        and isinstance(current_user, Business)
    ):
        return redirect(
            url_for("business.dashboard")
        )

    return render_template(
        "business/register.html"
    )


@business_bp.route("/register", methods=["POST"])
def register_submit():

    business_name = (
        request.form.get("business_name") or ""
    ).strip()

    owner_name = (
        request.form.get("owner_name") or ""
    ).strip()

    email = (
        request.form.get("email") or ""
    ).strip().lower()

    phone = (
        request.form.get("phone") or ""
    ).strip()

    business_type = (
        request.form.get("business_type") or ""
    ).strip()

    username = (
        request.form.get("username") or ""
    ).strip()

    password = (
        request.form.get("password") or ""
    )

    premises_type = (
        request.form.get("premises_type") or ""
    ).strip()

    address = (
        request.form.get("address") or ""
    ).strip()

    if not business_name:
        return jsonify(
            success=False,
            message="Please enter your business name."
        ), 400

    if not address:
        return jsonify(
            success=False,
            message="Please enter your business address."
        ), 400

    if not username:
        return jsonify(
            success=False,
            message="That username is already taken."
        ), 400

    if Business.query.filter_by(
        username=username
    ).first():

        return jsonify(
            success=False,
            message="That username is already taken."
        ), 409

    if Business.query.filter_by(
        email=email
    ).first():

        return jsonify(
            success=False,
            message=(
                "An account with that email "
                "already exists."
            )
        ), 409

    # --------------------------------------------------------
    # Automatic geocoding
    # --------------------------------------------------------

    lat, lng = 19.2437, 73.1355

    try:

        location = geolocator.geocode(
            address
        )

        if location:
            lat = location.latitude
            lng = location.longitude

    except Exception as e:

        print(
            "Geocoding error:",
            e
        )

    # --------------------------------------------------------
    # Documents
    # --------------------------------------------------------

    doc_subfolder = uuid.uuid4().hex

    try:

        doc_owner_path = _save_business_doc(
            request.files.get("doc_owner"),
            "Owner Identity Proof",
            doc_subfolder
        )

        doc_business_path = _save_business_doc(
            request.files.get("doc_business"),
            "Food Business Proof",
            doc_subfolder
        )

        doc_premises_path = _save_business_doc(
            request.files.get("doc_premises"),
            "Premises Proof",
            doc_subfolder
        )

    except ValueError as e:

        return jsonify(
            success=False,
            message=str(e)
        ), 400

    # --------------------------------------------------------
    # Create business
    # --------------------------------------------------------

    business = Business(
        business_name=business_name,
        owner_name=owner_name,
        username=username,
        email=email,
        phone=phone,
        business_type=business_type,
        address=address,

        latitude=lat,
        longitude=lng,

        status="pending",

        doc_owner_id_path=doc_owner_path,

        doc_business_proof_path=doc_business_path,

        doc_premises_owned_path=(
            doc_premises_path
            if premises_type == "owned"
            else None
        ),

        doc_premises_rented_path=(
            doc_premises_path
            if premises_type == "rented"
            else None
        ),
    )

    business.set_password(password)

    db.session.add(business)

    db.session.commit()

    return jsonify(
        success=True
    )


# ============================================================
# LOGOUT
# ============================================================

@business_bp.route("/logout", methods=["POST"])
def logout():

    logout_user()

    return jsonify(
        success=True,
        redirect=url_for("business.login")
    )


# ============================================================
# PROTECTED BUSINESS PAGES
# ============================================================

@business_bp.route("/dashboard")
@business_login_required
def dashboard():

    return render_template(
        "business/dashboard.html",
        real_business=_real_business_data(
            current_user
        )
    )



# ============================================================
# BUSINESS DASHBOARD — REAL MYSQL DATA
# ============================================================

@business_bp.route("/api/dashboard", methods=["GET"])
@business_login_required
def api_dashboard():
    """Return dashboard metrics and charts for the logged-in business."""

    # Orders are stored as naive UTC datetimes in the current schema.
    # Convert Indian-local day/week boundaries to UTC before querying.
    ist_offset = timedelta(hours=5, minutes=30)
    now_ist = datetime.utcnow() + ist_offset
    today = now_ist.date()
    week_start = today - timedelta(days=today.weekday())
    next_week = week_start + timedelta(days=7)
    month_start = today.replace(day=1)
    if month_start.month == 12:
        next_month = month_start.replace(year=month_start.year + 1, month=1)
    else:
        next_month = month_start.replace(month=month_start.month + 1)

    def utc_boundary(local_date):
        return datetime.combine(local_date, time.min) - ist_offset

    today_start_utc = utc_boundary(today)
    tomorrow_start_utc = utc_boundary(today + timedelta(days=1))
    week_start_utc = utc_boundary(week_start)
    next_week_start_utc = utc_boundary(next_week)
    month_start_utc = utc_boundary(month_start)
    next_month_start_utc = utc_boundary(next_month)

    base = Order.query.filter_by(business_id=current_user.business_id)

    today_orders = (
        base.filter(
            Order.ordered_at >= today_start_utc,
            Order.ordered_at < tomorrow_start_utc,
        ).all()
    )

    week_orders = (
        base.filter(
            Order.ordered_at >= week_start_utc,
            Order.ordered_at < next_week_start_utc,
        ).all()
    )

    month_orders = (
        base.filter(
            Order.ordered_at >= month_start_utc,
            Order.ordered_at < next_month_start_utc,
        ).all()
    )

    recent_orders = (
        base.order_by(Order.order_id.desc())
        .limit(5)
        .all()
    )

    def serialize_order(order):
        return {
            "id": str(order.order_id),
            "customer": (
                order.customer.full_name
                if order.customer else "Customer"
            ),
            "amount": (
                float(order.total_amount)
                if order.total_amount is not None else 0.0
            ),
            "deliveryType": order.delivery_type,
            "status": order.status,
            "time": (
                order.ordered_at.strftime("%d %b %Y, %I:%M %p")
                if order.ordered_at else ""
            ),
            "items": [
                {
                    "name": (
                        item.menu_item.food_name
                        if item.menu_item else "Item"
                    ),
                    "qty": item.quantity,
                    "price": (
                        float(item.price)
                        if item.price is not None else 0.0
                    ),
                }
                for item in order.items
            ],
        }

    # Monday -> Sunday. Order volume counts every non-cancelled order.
    weekly_orders = [0] * 7
    weekly_revenue = [0.0] * 7

    for order in week_orders:
        if not order.ordered_at:
            continue
        local_order_dt = order.ordered_at + ist_offset
        day_index = local_order_dt.weekday()

        if order.status != "cancelled":
            weekly_orders[day_index] += 1

        # Revenue is counted only after the order is delivered.
        if order.status == "delivered":
            weekly_revenue[day_index] += float(order.total_amount or 0)

    today_active_orders = [
        order for order in today_orders
        if order.status != "cancelled"
    ]
    today_delivered_revenue = sum(
        float(order.total_amount or 0)
        for order in today_orders
        if order.status == "delivered"
    )

    return jsonify(
        success=True,
        todayOrders=len(today_active_orders),
        pendingOrders=sum(
            1 for order in today_orders if order.status == "pending"
        ),
        todayRevenue=today_delivered_revenue,
        monthlyOrders=sum(
            1 for order in month_orders if order.status != "cancelled"
        ),
        cancelledOrders=sum(
            1 for order in month_orders if order.status == "cancelled"
        ),
        weeklyOrders=weekly_orders,
        weeklyRevenue=weekly_revenue,
        recentOrders=[serialize_order(order) for order in recent_orders],
    )


@business_bp.route("/menu")
@business_login_required
def menu():

    return render_template(
        "business/menu.html",
        real_business=_real_business_data(
            current_user
        )
    )


@business_bp.route("/orders")
@business_login_required
def orders():

    return render_template(
        "business/orders.html",
        real_business=_real_business_data(
            current_user
        )
    )


# ============================================================
# BUSINESS ORDERS — GET ORDERS FROM MYSQL
# ============================================================

@business_bp.route(
    "/api/orders",
    methods=["GET"]
)
@business_login_required
def api_business_orders():

    orders = (
        Order.query
        .filter_by(
            business_id=current_user.business_id
        )
        .order_by(
            Order.order_id.desc()
        )
        .all()
    )

    result = []

    for order in orders:

        result.append({

            "id": str(
                order.order_id
            ),

            "customer": (
                order.customer.full_name
                if order.customer
                else "Customer"
            ),

            "amount": (
                float(order.total_amount)
                if order.total_amount is not None
                else 0.0
            ),

            "paymentMethod": (
                order.payment_method
            ),

            "paymentStatus": (
                order.payment.payment_status
                if order.payment
                else "pending"
            ),

            "deliveryType": order.delivery_type,

            "status": order.status,

            "deliveryPerson": (
                {
                    "id": (
                        order.delivery_person.delivery_person_id
                    ),
                    "name": (
                        order.delivery_person.name
                    ),
                    "phone": (
                        order.delivery_person.phone
                    )
                }
                if order.delivery_person
                else None
            ),

            "time": (
                order.ordered_at.strftime(
                    "%d %b %Y, %I:%M %p"
                )
                if order.ordered_at
                else ""
            ),

            "address": (
                order.customer.address
                if order.customer
                else ""
            ),

            "items": [

                {
                    "name": (
                        item.menu_item.food_name
                        if item.menu_item
                        else "Item"
                    ),

                    "qty": item.quantity,

                    "price": (
                        float(item.price)
                        if item.price is not None
                        else 0.0
                    )
                }

                for item in order.items
            ]
        })

    return jsonify(
        success=True,
        orders=result
    )


# ============================================================
# DELIVERY PERSONS — GET
# ============================================================

@business_bp.route(
    "/api/delivery-persons",
    methods=["GET"]
)
@business_login_required
def api_business_delivery_persons():

    delivery_persons = (
        DeliveryPerson.query
        .filter_by(
            business_id=current_user.business_id,
            is_active=True
        )
        .order_by(
            DeliveryPerson.name.asc()
        )
        .all()
    )

    result = []

    for person in delivery_persons:

        result.append({

            "id": person.delivery_person_id,

            "name": person.name,

            "phone": person.phone,

            "username": person.username

        })

    return jsonify(
        success=True,
        deliveryPersons=result
    )


@business_bp.route("/delivery-persons")
@business_login_required
def delivery_persons_page():
    return render_template(
        "business/delivery_persons.html",
        real_business=_real_business_data(current_user)
    )

# ============================================================
# ASSIGN DELIVERY PERSON
# ============================================================

@business_bp.route(
    "/api/orders/<int:order_id>/assign-delivery-person",
    methods=["PUT"]
)
@business_login_required
def api_assign_delivery_person(order_id):

    data = _json_body() or {}

    delivery_person_id = data.get(
        "delivery_person_id"
    )

    if not delivery_person_id:

        return jsonify(
            success=False,
            message="Delivery person is required."
        ), 400

    order = Order.query.filter_by(
        order_id=order_id,
        business_id=current_user.business_id
    ).first()

    if not order:

        return jsonify(
            success=False,
            message="Order not found."
        ), 404

    delivery_person = DeliveryPerson.query.filter_by(
        delivery_person_id=delivery_person_id,
        business_id=current_user.business_id,
        is_active=True
    ).first()

    if not delivery_person:

        return jsonify(
            success=False,
            message="Delivery person not found."
        ), 404

    order.delivery_person_id = (
        delivery_person.delivery_person_id
    )

    db.session.commit()

    return jsonify(
        success=True,
        message="Delivery person assigned successfully.",
        deliveryPerson={
            "id": delivery_person.delivery_person_id,
            "name": delivery_person.name,
            "phone": delivery_person.phone
        }
    )


# ============================================================
# BUSINESS ORDERS — UPDATE STATUS
# ============================================================

@business_bp.route(
    "/api/orders/<int:order_id>/status",
    methods=["PUT"]
)
@business_login_required
def api_update_order_status(order_id):

    data = request.get_json(
        silent=True
    ) or {}

    new_status = str(
        data.get("status", "")
    ).strip().lower()

    # --------------------------------------------------------
    # Allowed database statuses
    # --------------------------------------------------------

    allowed_statuses = {
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled"
    }

    if new_status not in allowed_statuses:

        return jsonify(
            success=False,
            message="Invalid order status."
        ), 400

    # --------------------------------------------------------
    # Find order belonging to this business
    # --------------------------------------------------------

    order = Order.query.filter_by(
        order_id=order_id,
        business_id=current_user.business_id
    ).first()

    if not order:

        return jsonify(
            success=False,
            message="Order not found."
        ), 404

    # --------------------------------------------------------
    # Current status
    # --------------------------------------------------------

    current_status = order.status

    # --------------------------------------------------------
    # Allowed status transitions
    # --------------------------------------------------------

    valid_transitions = {

        "pending": [
            "confirmed",
            "cancelled"
        ],

        "confirmed": [
            "preparing"
        ],

        "preparing": [
            "ready"
        ],

        "ready": [
            "out_for_delivery",
            "delivered"
        ],

        "out_for_delivery": [
            "delivered"
        ],

        "delivered": [],

        "cancelled": []
    }

    if new_status not in valid_transitions.get(
        current_status,
        []
    ):

        return jsonify(
            success=False,
            message=(
                f"Order cannot be changed from "
                f"{current_status} to "
                f"{new_status}."
            )
        ), 400

    # --------------------------------------------------------
    # Save status
    # --------------------------------------------------------

    try:

        order.status = new_status

        # Add tracking history
        order.status_history.append(
            OrderStatusHistory(
                status=new_status
            )
        )

        # ----------------------------------------------------
        # COD payment
        # ----------------------------------------------------
        # COD remains pending while the order is being prepared.
        # Once delivered, cash has been collected.

        if (
            new_status == "delivered"
            and order.payment_method == "cod"
            and order.payment
        ):

            order.payment.payment_status = "success"

        db.session.commit()

        return jsonify(
            success=True,
            message=(
                "Order status updated successfully."
            ),
            order_id=order.order_id,
            status=order.status
        )

    except Exception as e:

        db.session.rollback()

        return jsonify(
            success=False,
            message=(
                "Could not update order status."
            ),
            error=str(e)
        ), 500


# ============================================================
# GPS API
# ============================================================

@business_bp.route(
    "/api/orders/<int:order_id>/location",
    methods=["PUT"]
)
@business_login_required
def api_update_order_location(order_id):

    data = _json_body() or {}

    latitude = data.get("latitude")
    longitude = data.get("longitude")
    accuracy = data.get("accuracy")

    if latitude is None or longitude is None:

        return jsonify(
            success=False,
            message="Latitude and longitude are required."
        ), 400

    order = Order.query.filter_by(
        order_id=order_id,
        business_id=current_user.business_id
    ).first()

    if not order:

        return jsonify(
            success=False,
            message="Order not found."
        ), 404

    if order.status != "out_for_delivery":

        return jsonify(
            success=False,
            message=(
                "Location tracking is only available "
                "for out-for-delivery orders."
            )
        ), 400

    location = OrderDeliveryLocation.query.filter_by(
        order_id=order.order_id
    ).first()

    if not location:

        location = OrderDeliveryLocation(
            order_id=order.order_id,
            latitude=latitude,
            longitude=longitude,
            accuracy=accuracy
        )

        db.session.add(location)

    else:

        location.latitude = latitude
        location.longitude = longitude
        location.accuracy = accuracy

    db.session.commit()

    return jsonify(
        success=True,
        message="Delivery location updated.",
        location={
            "latitude": float(
                location.latitude
            ),
            "longitude": float(
                location.longitude
            ),
            "accuracy": (
                float(location.accuracy)
                if location.accuracy is not None
                else None
            ),
            "updatedAt": (
                location.updated_at.isoformat()
                if location.updated_at
                else None
            )
        }
    )


# ============================================================
# DELIVERY PAGE
# ============================================================

@business_bp.route("/delivery")
@business_login_required
def delivery():

    return render_template(
        "business/delivery.html",
        real_business=_real_business_data(
            current_user
        )
    )


# ============================================================
# BUSINESS LOGO UPLOAD
# ============================================================

@business_bp.route("/uploads/logo/<path:filename>")
def business_logo(filename):
    # Business logos are display images used by the profile/sidebar.
    # Serve the saved image directly so <img src="..."> never receives
    # a login-page HTML redirect instead of the image file.
    directory = current_app.config["BUSINESS_LOGO_UPLOAD_FOLDER"]
    return send_from_directory(directory, filename)


@business_bp.route("/api/profile/logo", methods=["POST"])
@business_login_required
def upload_business_logo():
    file = request.files.get("logo")
    if file is None or not file.filename:
        return jsonify(success=False, message="Please select a logo image."), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png"}:
        return jsonify(success=False, message="Invalid logo. Accepted: JPG, JPEG, PNG."), 400

    file.stream.seek(0, os.SEEK_END)
    size_bytes = file.stream.tell()
    file.stream.seek(0)
    if size_bytes > 2 * 1024 * 1024:
        return jsonify(success=False, message="Logo must be 2 MB or smaller."), 400

    upload_dir = current_app.config["BUSINESS_LOGO_UPLOAD_FOLDER"]
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"business_{current_user.business_id}_{uuid.uuid4().hex}{ext}"
    file.save(os.path.join(upload_dir, filename))

    current_user.logo_path = filename
    db.session.commit()

    return jsonify(
        success=True,
        message="Business logo updated successfully!",
        logoUrl=url_for("business.business_logo", filename=filename),
        business=_real_business_data(current_user)
    )


# ============================================================
# PROFILE PAGE & UPDATE API
# ============================================================

@business_bp.route(
    "/profile",
    methods=["GET", "POST"]
)
@business_login_required
def profile():

    if request.method == "POST":

        data = _json_body()

        # ----------------------------------------------------
        # Basic fields
        # ----------------------------------------------------

        if (
            "business_name" in data
            or "name" in data
        ):

            current_user.business_name = (
                data.get("business_name")
                or data.get("name")
                or ""
            ).strip()

        if (
            "owner_name" in data
            or "owner" in data
        ):

            current_user.owner_name = (
                data.get("owner_name")
                or data.get("owner")
                or ""
            ).strip()

        if "phone" in data:

            current_user.phone = (
                data.get("phone") or ""
            ).strip()

        if (
            "business_type" in data
            or "type" in data
        ):

            current_user.business_type = (
                data.get("business_type")
                or data.get("type")
                or ""
            ).strip()

        if "description" in data:

            current_user.description = (
                data.get("description")
                or ""
            ).strip()

        # ----------------------------------------------------
        # Location
        # ----------------------------------------------------

        if "address" in data:

            current_user.address = (
                data.get("address")
                or ""
            ).strip()

        if (
            hasattr(current_user, "city")
            and "city" in data
        ):

            current_user.city = (
                data.get("city")
                or ""
            ).strip()

        if (
            hasattr(current_user, "pincode")
            and "pincode" in data
        ):

            current_user.pincode = (
                data.get("pincode")
                or ""
            ).strip()

        # ----------------------------------------------------
        # Latitude
        # ----------------------------------------------------

        lat_val = data.get(
            "latitude"
        )

        lng_val = data.get(
            "longitude"
        )

        try:

            current_user.latitude = (
                float(lat_val)
                if lat_val
                and str(lat_val).strip()
                else None
            )

        except (
            ValueError,
            TypeError
        ):

            current_user.latitude = None

        # ----------------------------------------------------
        # Longitude
        # ----------------------------------------------------

        try:

            current_user.longitude = (
                float(lng_val)
                if lng_val
                and str(lng_val).strip()
                else None
            )

        except (
            ValueError,
            TypeError
        ):

            current_user.longitude = None

        db.session.commit()

        if (
            request.is_json
            or request.headers.get(
                "X-Requested-With"
            ) == "XMLHttpRequest"
        ):

            return jsonify(
                success=True,
                business=_real_business_data(
                    current_user
                )
            )

        return redirect(
            url_for("business.profile")
        )

    return render_template(
        "business/profile.html",
        real_business=_real_business_data(
            current_user
        )
    )


# ============================================================
# PROFILE API
# ============================================================

@business_bp.route(
    "/api/profile",
    methods=["GET", "POST"]
)
@business_login_required
def update_profile():

    # ========================================================
    # GET — LOAD CURRENT BUSINESS PROFILE
    # ========================================================

    if request.method == "GET":

        return jsonify(
            success=True,
            business=_real_business_data(
                current_user
            )
        )

    # ========================================================
    # POST — UPDATE BUSINESS PROFILE
    # ========================================================

    data = request.get_json(
        silent=True
    ) or {}

    business = current_user

    try:

        if "business_name" in data:

            business.business_name = (
                data["business_name"]
            )

        if "owner_name" in data:

            business.owner_name = (
                data["owner_name"]
            )

        if "email" in data:

            business.email = (
                data["email"]
            )

        if "phone" in data:

            business.phone = (
                data["phone"]
            )

        if "business_type" in data:

            business.business_type = (
                data["business_type"]
            )

        if "description" in data:

            business.description = (
                data["description"]
            )

        if "address" in data:

            business.address = (
                data["address"]
            )

        if "city" in data:

            business.city = (
                data["city"]
            )

        if "pincode" in data:

            business.pincode = (
                data["pincode"]
            )

        # ----------------------------------------------------
        # Delivery and pickup services
        # ----------------------------------------------------

        services = (
            data.get("services") or {}
        )

        business.delivery_available = bool(
            services.get(
                "delivery",
                False
            )
        )

        business.self_pickup_available = bool(
            services.get(
                "selfPickup",
                False
            )
        )

        # ----------------------------------------------------
        # Operating hours
        # ----------------------------------------------------

        if data.get("opening_time"):

            business.opening_time = (
                datetime.strptime(
                    data["opening_time"],
                    "%H:%M"
                ).time()
            )

        else:

            business.opening_time = None

        if data.get("closing_time"):

            business.closing_time = (
                datetime.strptime(
                    data["closing_time"],
                    "%H:%M"
                ).time()
            )

        else:

            business.closing_time = None

        # ----------------------------------------------------
        # GPS
        # ----------------------------------------------------

        if data.get("latitude"):

            business.latitude = (
                data["latitude"]
            )

        if data.get("longitude"):

            business.longitude = (
                data["longitude"]
            )

        # ----------------------------------------------------
        # SAVE
        # ----------------------------------------------------

        db.session.commit()

        return jsonify(
            success=True,
            message="Profile updated successfully!",
            business=_real_business_data(business)
        )

    except Exception as e:

        db.session.rollback()

        return jsonify(
            success=False,
            message=str(e)
        ), 500


# ============================================================
# REVIEWS
# ============================================================

@business_bp.route("/reviews")
@business_login_required
def reviews():
    return render_template("business/reviews.html", real_business=_real_business_data(current_user))


def _business_review_dict(review):
    return {
        "id": review.review_id,
        "customer": review.customer.full_name if review.customer else "Customer",
        "rating": review.rating,
        "comment": review.review or "",
        "menuId": review.menu_id,
        "menuName": review.menu_item.food_name if review.menu_item else "Food Item",
        "orderId": review.order_id,
        "date": review.created_at.strftime("%d %b %Y, %I:%M %p") if review.created_at else "",
        "reply": review.business_reply or "",
        "repliedAt": review.replied_at.isoformat() if review.replied_at else None,
    }


@business_bp.route("/api/reviews", methods=["GET"])
@business_login_required
def api_business_reviews():
    reviews = Review.query.filter_by(business_id=current_user.business_id).order_by(Review.created_at.desc()).all()
    counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for review in reviews:
        if review.rating in counts:
            counts[review.rating] += 1
    total = len(reviews)
    average = round(sum(r.rating for r in reviews) / total, 1) if total else None
    return jsonify(success=True, reviews=[_business_review_dict(r) for r in reviews],
                   summary={"average": average, "total": total, "distribution": counts})


@business_bp.route("/api/reviews/<int:review_id>/reply", methods=["POST"])
@business_login_required
def api_business_review_reply(review_id):
    data = request.get_json(silent=True) or {}
    reply = (data.get("reply") or "").strip()
    if not reply:
        return jsonify(success=False, message="Please enter a response."), 400
    if len(reply) > 1000:
        return jsonify(success=False, message="Response is too long. Please keep it under 1000 characters."), 400
    review = Review.query.filter_by(review_id=review_id, business_id=current_user.business_id).first()
    if not review:
        return jsonify(success=False, message="Review not found."), 404
    review.business_reply = reply
    review.replied_at = datetime.utcnow()
    db.session.commit()
    return jsonify(success=True, message="Response posted successfully!", review=_business_review_dict(review))


# ============================================================
# MENU MANAGEMENT
# ============================================================

def _menu_item_dict(item):

    return {

        "id": str(
            item.menu_id
        ),

        "name": item.food_name,

        "category": (
            item.category.slug
            if item.category
            else ""
        ),

        "price": float(
            item.price
        ),

        "type": item.food_type,

        "prepTime": (
            item.prep_time_minutes
        ),

        "desc": (
            item.description or ""
        ),

        "imageUrl": (
            item.image or ""
        ),

        "available": (
            item.is_available
        ),
    }


# ============================================================
# CATEGORIES
# ============================================================

@business_bp.route(
    "/api/categories",
    methods=["GET"]
)
@business_login_required
def api_categories():

    categories = (
        Category.query
        .order_by(
            Category.category_id
        )
        .all()
    )

    return jsonify(
        categories=[
            {
                "slug": c.slug,
                "name": c.category_name
            }
            for c in categories
        ]
    )


# ============================================================
# MENU — GET
# ============================================================

@business_bp.route(
    "/api/menu",
    methods=["GET"]
)
@business_login_required
def api_menu_list():

    items = (
        MenuItem.query
        .filter_by(
            business_id=current_user.business_id
        )
        .order_by(
            MenuItem.menu_id
        )
        .all()
    )

    return jsonify(
        menu=[
            _menu_item_dict(i)
            for i in items
        ]
    )


# ============================================================
# MENU VALIDATION
# ============================================================

def _validated_menu_payload(data):
    """
    Shared validation for create/update.
    Returns:
        (fields_dict, error_message)
    """

    name = (
        data.get("name") or ""
    ).strip()

    category_slug = (
        data.get("category") or ""
    ).strip()

    food_type = (
        data.get("type") or ""
    ).strip()

    desc = (
        data.get("desc") or ""
    ).strip()

    image_url = (
        data.get("imageUrl") or ""
    ).strip()

    available = bool(
        data.get(
            "available",
            True
        )
    )

    if not name:

        return (
            None,
            "Please enter a food item name."
        )

    if food_type not in (
        "veg",
        "nonveg"
    ):

        return (
            None,
            "Please select a valid food type."
        )

    try:

        price = float(
            data.get("price")
        )

        if price <= 0:
            raise ValueError()

    except (
        TypeError,
        ValueError
    ):

        return (
            None,
            "Please enter a valid price."
        )

    try:

        prep_time = int(
            data.get("prepTime")
        )

        if prep_time <= 0:
            raise ValueError()

    except (
        TypeError,
        ValueError
    ):

        return (
            None,
            "Please enter a valid prep time."
        )

    category = Category.query.filter_by(
        slug=category_slug
    ).first()

    if not category:

        return (
            None,
            "Please select a valid category."
        )

    return {

        "food_name": name,

        "category_id": (
            category.category_id
        ),

        "price": price,

        "food_type": food_type,

        "prep_time_minutes": prep_time,

        "description": desc,

        "image": image_url,

        "is_available": available,

    }, None


# ============================================================
# MENU — CREATE
# ============================================================

@business_bp.route(
    "/api/menu",
    methods=["POST"]
)
@business_login_required
def api_menu_create():

    data = _json_body()

    fields, error = (
        _validated_menu_payload(data)
    )

    if error:

        return jsonify(
            success=False,
            message=error
        ), 400

    item = MenuItem(
        business_id=current_user.business_id,
        **fields
    )

    db.session.add(item)

    db.session.commit()

    return jsonify(
        success=True,
        item=_menu_item_dict(item)
    )


# ============================================================
# MENU — UPDATE
# ============================================================

@business_bp.route(
    "/api/menu/<int:menu_id>",
    methods=["PUT"]
)
@business_login_required
def api_menu_update(menu_id):

    item = MenuItem.query.filter_by(
        menu_id=menu_id,
        business_id=current_user.business_id
    ).first()

    if not item:

        return jsonify(
            success=False,
            message="Menu item not found."
        ), 404

    data = _json_body()

    fields, error = (
        _validated_menu_payload(data)
    )

    if error:

        return jsonify(
            success=False,
            message=error
        ), 400

    for key, value in fields.items():

        setattr(
            item,
            key,
            value
        )

    db.session.commit()

    return jsonify(
        success=True,
        item=_menu_item_dict(item)
    )


# ============================================================
# MENU — DELETE
# ============================================================

@business_bp.route(
    "/api/menu/<int:menu_id>",
    methods=["DELETE"]
)
@business_login_required
def api_menu_delete(menu_id):

    item = MenuItem.query.filter_by(
        menu_id=menu_id,
        business_id=current_user.business_id
    ).first()

    if not item:

        return jsonify(
            success=False,
            message="Menu item not found."
        ), 404

    db.session.delete(item)

    db.session.commit()

    return jsonify(
        success=True
    )


# ============================================================
# MENU — TOGGLE AVAILABILITY
# ============================================================

@business_bp.route(
    "/api/menu/<int:menu_id>/availability",
    methods=["PATCH"]
)
@business_login_required
def api_menu_toggle_availability(menu_id):

    item = MenuItem.query.filter_by(
        menu_id=menu_id,
        business_id=current_user.business_id
    ).first()

    if not item:

        return jsonify(
            success=False,
            message="Menu item not found."
        ), 404

    data = _json_body()

    item.is_available = bool(
        data.get(
            "available",
            item.is_available
        )
    )

    db.session.commit()

    return jsonify(
        success=True,
        item=_menu_item_dict(item)
    )
    
    
def _release_removed_delivery_credentials(username, phone, exclude_id=None):
    """
    Delivery persons are soft-deleted (is_active=False) so old orders keep
    pointing at them, but `username` and `phone` are UNIQUE in the table.
    Without this, a removed person's username/phone could never be used
    again (the "Username already exists" error for someone who isn't even
    in the list).

    Only ACTIVE people should block a username/phone. So before saving, any
    removed person still holding the same username/phone gets that value
    renamed to a harmless tombstone (e.g. "9000000001~r4"). The record and
    its order history stay intact; the value is simply freed up.
    This also cleans up ghost rows that already exist in the database.
    """
    query = DeliveryPerson.query.filter(
        DeliveryPerson.is_active == False,  # noqa: E712
        db.or_(
            DeliveryPerson.username == username,
            DeliveryPerson.phone == phone
        )
    )

    if exclude_id is not None:
        query = query.filter(
            DeliveryPerson.delivery_person_id != exclude_id
        )

    for removed in query.all():
        if removed.username == username:
            removed.username = (
                f"{username[:80]}~removed{removed.delivery_person_id}"
            )
        if removed.phone == phone:
            removed.phone = (
                f"{phone[:14]}~r{removed.delivery_person_id}"
            )

    # Write the released values first so the unique constraints are
    # already clear when the active person takes them.
    db.session.flush()


@business_bp.route("/api/delivery-persons", methods=["POST"])
@business_login_required
def api_add_delivery_person():
    data = _json_body() or {}

    name = str(data.get("name", "")).strip()
    phone = str(data.get("phone", "")).strip()
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", "")).strip()

    if not name or not phone or not username or not password:
        return jsonify(
            success=False,
            message="Name, phone, username and password are required."
        ), 400

    if len(password) < 6:
        return jsonify(
            success=False,
            message="Password must be at least 6 characters."
        ), 400

    existing_username = DeliveryPerson.query.filter_by(
        username=username,
        is_active=True
    ).first()

    if existing_username:
        return jsonify(
            success=False,
            message="Username already exists. Please choose another one."
        ), 400

    existing_phone = DeliveryPerson.query.filter_by(
        phone=phone,
        is_active=True
    ).first()

    if existing_phone:
        return jsonify(
            success=False,
            message="This phone number is already used by another delivery person."
        ), 400

    # Free up username/phone held by previously removed delivery persons.
    _release_removed_delivery_credentials(username, phone)

    delivery_person = DeliveryPerson(
        business_id=current_user.business_id,
        name=name,
        phone=phone,
        username=username,
        password=generate_password_hash(password),
        is_active=True
    )

    db.session.add(delivery_person)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify(
            success=False,
            message="Username or phone number is already in use."
        ), 400

    return jsonify(
        success=True,
        message="Delivery person added successfully.",
        deliveryPerson={
            "id": delivery_person.delivery_person_id,
            "name": delivery_person.name,
            "phone": delivery_person.phone,
            "username": delivery_person.username,
            "isActive": delivery_person.is_active
        }
    ), 201


# ============================================================
# DELIVERY PERSONS — UPDATE
# ============================================================

@business_bp.route(
    "/api/delivery-persons/<int:delivery_person_id>",
    methods=["PUT"]
)
@business_login_required
def api_update_delivery_person(delivery_person_id):
    data = _json_body() or {}

    person = DeliveryPerson.query.filter_by(
        delivery_person_id=delivery_person_id,
        business_id=current_user.business_id,
        is_active=True
    ).first()

    if not person:
        return jsonify(
            success=False,
            message="Delivery person not found."
        ), 404

    name = str(data.get("name", "")).strip()
    phone = str(data.get("phone", "")).strip()
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", "")).strip()

    if not name or not phone or not username:
        return jsonify(
            success=False,
            message="Name, phone and username are required."
        ), 400

    existing_username = DeliveryPerson.query.filter(
        DeliveryPerson.username == username,
        DeliveryPerson.is_active == True,  # noqa: E712
        DeliveryPerson.delivery_person_id != delivery_person_id
    ).first()

    if existing_username:
        return jsonify(
            success=False,
            message="Username already exists. Please choose another one."
        ), 400

    existing_phone = DeliveryPerson.query.filter(
        DeliveryPerson.phone == phone,
        DeliveryPerson.is_active == True,  # noqa: E712
        DeliveryPerson.delivery_person_id != delivery_person_id
    ).first()

    if existing_phone:
        return jsonify(
            success=False,
            message="This phone number is already used by another delivery person."
        ), 400

    if password and len(password) < 6:
        return jsonify(
            success=False,
            message="Password must be at least 6 characters."
        ), 400

    # Free up username/phone held by previously removed delivery persons
    # (must happen before this person takes them).
    _release_removed_delivery_credentials(
        username,
        phone,
        exclude_id=delivery_person_id
    )

    person.name = name
    person.phone = phone
    person.username = username

    # Password is optional while editing. If it is blank, keep the old one.
    if password:
        person.password = generate_password_hash(password)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify(
            success=False,
            message="Username or phone number is already in use."
        ), 400

    return jsonify(
        success=True,
        message="Delivery person updated successfully.",
        deliveryPerson={
            "id": person.delivery_person_id,
            "name": person.name,
            "phone": person.phone,
            "username": person.username,
            "isActive": person.is_active
        }
    )


# ============================================================
# DELIVERY PERSONS — DELETE / DEACTIVATE
# ============================================================

@business_bp.route(
    "/api/delivery-persons/<int:delivery_person_id>",
    methods=["DELETE"]
)
@business_login_required
def api_delete_delivery_person(delivery_person_id):
    person = DeliveryPerson.query.filter_by(
        delivery_person_id=delivery_person_id,
        business_id=current_user.business_id,
        is_active=True
    ).first()

    if not person:
        return jsonify(
            success=False,
            message="Delivery person not found."
        ), 404

    # Soft delete so existing order history can still keep its delivery-person reference.
    person.is_active = False
    db.session.commit()

    return jsonify(
        success=True,
        message="Delivery person removed successfully."
    )
