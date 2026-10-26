from flask import Blueprint, request, jsonify, session, render_template
from werkzeug.security import check_password_hash
from extensions import db
from models import DeliveryPerson, Order, OrderDeliveryLocation

delivery_bp = Blueprint(
    "delivery",
    __name__,
    url_prefix="/delivery"
)


@delivery_bp.route("/login", methods=["GET"])
def delivery_login_page():
    return render_template("delivery/login.html")


@delivery_bp.route("/login", methods=["POST"])
def delivery_login():
    data = request.get_json(silent=True) or request.form

    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify(
            success=False,
            message="Please enter username and password."
        ), 400

    delivery_person = DeliveryPerson.query.filter_by(
        username=username,
        is_active=True
    ).first()

    if not delivery_person:
        return jsonify(
            success=False,
            message="Invalid username or password."
        ), 401

    # The business page trims the password when it is saved, so accept the
    # trimmed form too (e.g. a trailing space copied along with the password).
    password_ok = (
        check_password_hash(delivery_person.password, password)
        or check_password_hash(delivery_person.password, password.strip())
    )

    if not password_ok:
        return jsonify(
            success=False,
            message="Invalid username or password."
        ), 401

    session["delivery_person_id"] = delivery_person.delivery_person_id

    return jsonify(
        success=True,
        message="Login successful.",
        redirect="/delivery/dashboard"
    )
    
@delivery_bp.route("/dashboard")
def delivery_dashboard():
    delivery_person_id = session.get("delivery_person_id")

    if not delivery_person_id:
        return jsonify(
            success=False,
            message="Please log in first."
        ), 401

    delivery_person = DeliveryPerson.query.get(
        delivery_person_id
    )

    if not delivery_person or not delivery_person.is_active:
        session.pop("delivery_person_id", None)

        return jsonify(
            success=False,
            message="Delivery person account not found."
        ), 401

    return render_template(
        "delivery/dashboard.html",
        delivery_person=delivery_person
    )
    
@delivery_bp.route("/api/orders", methods=["GET"])
def delivery_orders():
    delivery_person_id = session.get("delivery_person_id")

    if not delivery_person_id:
        return jsonify(
            success=False,
            message="Please log in first."
        ), 401

    delivery_person = DeliveryPerson.query.filter_by(
        delivery_person_id=delivery_person_id,
        is_active=True
    ).first()

    if not delivery_person:
        session.pop("delivery_person_id", None)

        return jsonify(
            success=False,
            message="Delivery person account not found."
        ), 401

    orders = (
        Order.query
        .filter_by(
            delivery_person_id=delivery_person.delivery_person_id
        )
        .order_by(Order.order_id.desc())
        .all()
    )

    result = []

    for order in orders:

        result.append({
            "id": order.order_id,

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

            "paymentMethod": order.payment_method,

            "paymentStatus": (
                order.payment.payment_status
                if order.payment
                else "pending"
            ),

            "deliveryType": order.delivery_type,

            "status": order.status,

            "address": (
                order.customer.address
                if order.customer
                else ""
            ),

            "time": (
                order.ordered_at.strftime(
                    "%d %b %Y, %I:%M %p"
                )
                if order.ordered_at
                else ""
            )
        })

    return jsonify(
        success=True,
        orders=result
    )
    
    
@delivery_bp.route(
    "/api/orders/<int:order_id>/location",
    methods=["PUT"]
)
def delivery_update_order_location(order_id):

    delivery_person_id = session.get(
        "delivery_person_id"
    )

    if not delivery_person_id:
        return jsonify(
            success=False,
            message="Please log in first."
        ), 401


    delivery_person = DeliveryPerson.query.filter_by(
        delivery_person_id=delivery_person_id,
        is_active=True
    ).first()


    if not delivery_person:
        session.pop(
            "delivery_person_id",
            None
        )

        return jsonify(
            success=False,
            message="Delivery person account not found."
        ), 401


    order = Order.query.filter_by(
        order_id=order_id,
        delivery_person_id=delivery_person.delivery_person_id
    ).first()


    if not order:
        return jsonify(
            success=False,
            message="Order is not assigned to you."
        ), 404


    if order.status != "out_for_delivery":
        return jsonify(
            success=False,
            message="Location tracking is only available for out-for-delivery orders."
        ), 400


    data = request.get_json(silent=True) or {}


    latitude = data.get("latitude")
    longitude = data.get("longitude")
    accuracy = data.get("accuracy")


    if latitude is None or longitude is None:
        return jsonify(
            success=False,
            message="Latitude and longitude are required."
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
            "latitude": float(location.latitude),
            "longitude": float(location.longitude),
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