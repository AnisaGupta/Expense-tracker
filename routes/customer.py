"""
Routes for the customer side of LocalBites: login/register, the home
dashboard/feed, search, category browsing, food details, profile, orders, and favorites.
"""
import os
import razorpay
from datetime import datetime
from flask import Blueprint, render_template, request, jsonify, redirect, url_for, current_app, send_from_directory
from flask_login import login_user, logout_user, current_user

from extensions import db
from models import (
    Customer, Business, MenuItem, Category, Order, OrderItem, 
    Payment, OrderStatusHistory, Favorite, OrderDeliveryLocation, Review
)
from models.cart import Cart, CartItem
from models.business import BUSINESS_TYPES
from auth import customer_login_required
from otp_service import has_recent_verified_otp
from models.customer import Customer
import math
from flask import render_template, session
from flask_login import current_user
from models.business import Business
from models.menu_item import MenuItem
from sqlalchemy import desc, func

def haversine(lat1, lon1, lat2, lon2):
    # Safety check: if any coordinate is missing or None, return 0.0 (same location) instead of erroring
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return 0.0
    try:
        R = 6371
        dLat = math.radians(float(lat2) - float(lat1))
        dLon = math.radians(float(lon2) - float(lon1))
        a = (math.sin(dLat / 2) ** 2 +
             math.cos(math.radians(float(lat1))) * math.cos(math.radians(float(lat2))) *
             math.sin(dLon / 2) ** 2)
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    except (ValueError, TypeError):
        return 0.0
        
# Initialize Razorpay Client right under imports
razorpay_client = razorpay.Client(auth=(os.getenv("RAZORPAY_KEY_ID"), os.getenv("RAZORPAY_KEY_SECRET")))
customer_bp = Blueprint("customer", __name__, url_prefix="/customer")

def _json_body():
    """Accept either JSON or classic form-encoded submissions."""
    data = request.get_json(silent=True)
    if data is None:
        data = request.form
    return data


# ---------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------

@customer_bp.route("/login", methods=["GET"])
def login():
    if current_user.is_authenticated and isinstance(current_user, Customer):
        return redirect(url_for("customer.dashboard"))
    return render_template("customer/login.html")


@customer_bp.route("/login", methods=["POST"])
def login_submit():
    data = _json_body()
    identifier = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not identifier or not password:
        return jsonify(success=False, message="Please enter your username and password."), 400

    customer = Customer.query.filter(
        (Customer.username == identifier) | (Customer.email == identifier.lower())
    ).first()

    if not customer or not customer.check_password(password):
        return jsonify(success=False, message="Invalid username or password."), 401

    login_user(customer)
    return jsonify(success=True, redirect=url_for("main.location"))


# ---------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------

@customer_bp.route("/register", methods=["GET"])
def register():
    if current_user.is_authenticated and isinstance(current_user, Customer):
        return redirect(url_for("customer.dashboard"))
    return render_template("customer/register.html")


@customer_bp.route("/register", methods=["POST"])
def register_submit():
    data = _json_body()

    full_name = (data.get("full_name") or "").strip()
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()
    password = data.get("password") or ""

    if not full_name:
        return jsonify(success=False, message="Please enter your full name."), 400
    if not username:
        return jsonify(success=False, message="Please choose a username."), 400
    if not email:
        return jsonify(success=False, message="Please enter your email address."), 400
    if not phone:
        return jsonify(success=False, message="Please enter your mobile number."), 400
    if len(password) < 8:
        return jsonify(success=False, message="Password must be at least 8 characters long."), 400

    if Customer.query.filter_by(username=username).first():
        return jsonify(success=False, message="That username is already taken."), 409
    if Customer.query.filter_by(email=email).first():
        return jsonify(success=False, message="An account with that email already exists."), 409

    if not has_recent_verified_otp(email, "customer", "register"):
        return jsonify(
            success=False,
            message="Please verify your email with the OTP sent to you first.",
        ), 403

    customer = Customer(full_name=full_name, username=username, email=email, phone=phone)
    customer.set_password(password)

    db.session.add(customer)
    db.session.commit()

    login_user(customer)
    return jsonify(success=True, redirect=url_for("main.location"))


# ---------------------------------------------------------------------
# Cart / Checkout Helpers & Route
# ---------------------------------------------------------------------

def _calculate_bill(cart_items, coupon_code=""):
    """Calculates order breakdown with realistic coupon logic and GST."""
    item_total = 0.0
    for item in cart_items:
        item_total += item['price'] * item['qty']

    delivery_fee = 35.00 if item_total > 0 else 0.0
    discount = 0.0
    code = (coupon_code or "").strip().upper()

    if code == "CELEBRATIONS":
        if item_total >= 400:
            discount = min(item_total * 0.20, 150.00)
    elif code == "WELCOME50":
        if item_total >= 199:
            discount = min(item_total * 0.50, 100.00)
    elif code == "LOCALBITES":
        if item_total >= 150:
            discount = 50.00
    elif code == "FREEDEL":
        if item_total >= 250:
            discount = delivery_fee

    taxable_amount = max(0.0, item_total - discount)
    gst_charges = round(taxable_amount * 0.05, 2) if taxable_amount > 0 else 0.0
    to_pay = max(0.0, taxable_amount + delivery_fee + gst_charges)

    return {
        'item_total': round(item_total, 2),
        'delivery_fee': delivery_fee,
        'discount': round(discount, 2),
        'gst_charges': gst_charges,
        'to_pay': round(to_pay, 2),
        'applied_coupon': code if discount > 0 else None
    }


@customer_bp.route('/cart')
@customer_login_required
def cart():
    customer_data = {
        'name': getattr(current_user, 'full_name', 'Customer'),
        'email': getattr(current_user, 'email', ''),
        'phone': getattr(current_user, 'phone', '')
    }

    raw_address = getattr(current_user, 'address', '') or ''
    user_address = raw_address.strip()
    addresses_data = [{
        'id': 1,
        'label': 'Home',
        'full_address': user_address if user_address else 'Please set your delivery address in profile.',
        'eta': '35 MINS'
    }]

    user_cart = Cart.query.filter_by(customer_id=current_user.customer_id)\
                          .order_by(Cart.cart_id.desc()).first()
    if not user_cart:
        user_cart = Cart(customer_id=current_user.customer_id)
        db.session.add(user_cart)
        db.session.commit()

    cart_items = []
    restaurant_name = "LocalBites Kitchen"
    restaurant_location = "Local Area"

    db_cart_items = CartItem.query.filter_by(cart_id=user_cart.cart_id).all()

    for item in db_cart_items:
        menu_item = item.menu_item or MenuItem.query.get(item.menu_id)
        if menu_item:
            unit_price = float(menu_item.price) if menu_item.price else 0.0
            qty = item.quantity or 1
            
            business = getattr(menu_item, 'business', None) or (
                Business.query.get(menu_item.business_id) if getattr(menu_item, 'business_id', None) else None
            )

            if business:
                restaurant_name = getattr(business, 'business_name', 'LocalBites Kitchen')
                restaurant_location = getattr(business, 'address', '') or "Local Store"

            cart_items.append({
                'id': item.cart_item_id,
                'menu_id': item.menu_id,
                'name': getattr(menu_item, 'food_name', 'Menu Item'),
                'price': unit_price,
                'qty': qty
            })

    bill_details = _calculate_bill(cart_items)
    bill_details['restaurant_name'] = restaurant_name
    bill_details['restaurant_location'] = restaurant_location

    return render_template(
        'customer/cart.html',
        customer=customer_data,
        cart_items=cart_items,
        bill=bill_details,
        addresses=addresses_data,
        razorpay_key_id=os.getenv("rzp_test_TZ7xYz6wVJ0lcq")
    )


# ---------------------------------------------------------------------
# Cart API Endpoints
# ---------------------------------------------------------------------

@customer_bp.route('/api/cart/count', methods=['GET'])
@customer_login_required
def api_cart_count():
    user_cart = Cart.query.filter_by(customer_id=current_user.customer_id).first()
    total_items = 0
    if user_cart:
        db_items = CartItem.query.filter_by(cart_id=user_cart.cart_id).all()
        total_items = sum(item.quantity for item in db_items)
    return jsonify({'success': True, 'total_items': total_items})


@customer_bp.route('/api/cart/add', methods=['POST'])
@customer_login_required
def api_add_to_cart():
    data = request.get_json()
    menu_id = data.get('menu_id')
    quantity = int(data.get('quantity', 1))
    force_clear = data.get('force_clear', False) # Flag if user confirms clearing cart
    
    if not menu_id:
        return jsonify({'success': False, 'message': 'Invalid menu item ID.'}), 400

    menu_item = MenuItem.query.get(menu_id)
    if not menu_item:
        return jsonify({'success': False, 'message': 'Item not found.'}), 404

    # Get or create active cart for customer
    user_cart = Cart.query.filter_by(customer_id=current_user.customer_id).first()
    if not user_cart:
        user_cart = Cart(customer_id=current_user.customer_id)
        db.session.add(user_cart)
        db.session.commit()

    # Check multi-restaurant restriction:
    existing_items = CartItem.query.filter_by(cart_id=user_cart.cart_id).all()
    if existing_items and not force_clear:
        # Check if the existing items belong to a different business
        first_existing_menu = MenuItem.query.get(existing_items[0].menu_id)
        if first_existing_menu and first_existing_menu.business_id != menu_item.business_id:
            return jsonify({
                'success': False,
                'conflict': True,
                'message': 'Your cart contains items from another restaurant. Do you want to reset your cart and add this item?'
            })

    # If force_clear is True, wipe out old items first
    if force_clear:
        CartItem.query.filter_by(cart_id=user_cart.cart_id).delete()
        db.session.commit()

    # Add or update item in cart
    cart_item = CartItem.query.filter_by(cart_id=user_cart.cart_id, menu_id=menu_id).first()
    if cart_item:
        cart_item.quantity += quantity
    else:
        cart_item = CartItem(cart_id=user_cart.cart_id, menu_id=menu_id, quantity=quantity)
        db.session.add(cart_item)
    
    db.session.commit()

    all_items = CartItem.query.filter_by(cart_id=user_cart.cart_id).all()
    total_items = sum(item.quantity for item in all_items)

    return jsonify({
        'success': True,
        'message': 'Item added to cart',
        'total_items': total_items,
        'new_quantity': cart_item.quantity
    })


@customer_bp.route("/api/cart/clear", methods=["POST"])
@customer_login_required
def api_clear_cart():
    user_cart = Cart.query.filter_by(customer_id=current_user.customer_id).first()
    if user_cart:
        CartItem.query.filter_by(cart_id=user_cart.cart_id).delete()
        db.session.commit()
    return jsonify(success=True, message="Cart cleared successfully.")

@customer_bp.route('/api/cart/update-qty', methods=['POST'])
@customer_login_required
def api_update_cart_qty():
    data = request.get_json() or {}
    cart_item_id = data.get('cart_item_id')
    menu_id = data.get('menu_id')
    change = int(data.get('change', 0))

    user_cart = Cart.query.filter_by(customer_id=current_user.customer_id).first()
    if not user_cart:
        return jsonify({'success': False, 'message': 'Cart not found'}), 404

    cart_item = None
    if cart_item_id:
        cart_item = CartItem.query.filter_by(cart_id=user_cart.cart_id, cart_item_id=cart_item_id).first()
    elif menu_id:
        cart_item = CartItem.query.filter_by(cart_id=user_cart.cart_id, menu_id=menu_id).first()

    new_quantity = 0
    if cart_item:
        cart_item.quantity += change
        if cart_item.quantity <= 0:
            db.session.delete(cart_item)
            new_quantity = 0
        else:
            new_quantity = cart_item.quantity
        db.session.commit()
    elif not cart_item_id and menu_id and change > 0:
        cart_item = CartItem(cart_id=user_cart.cart_id, menu_id=menu_id, quantity=change)
        db.session.add(cart_item)
        db.session.commit()
        new_quantity = change
    all_items = CartItem.query.filter_by(cart_id=user_cart.cart_id).all()
    total_items = sum(item.quantity for item in all_items)

    return jsonify({
        'success': True,
        'new_quantity': new_quantity,
        'total_items': total_items
    })


@customer_bp.route("/api/cart/apply-coupon", methods=["POST"])
@customer_login_required
def api_apply_coupon():
    data = _json_body()
    coupon_code = data.get("coupon_code", "")

    user_cart = Cart.query.filter_by(customer_id=current_user.customer_id).first()
    if not user_cart:
        return jsonify(success=False, message="Cart not found."), 404

    db_cart_items = CartItem.query.filter_by(cart_id=user_cart.cart_id).all()
    cart_items = []
    for item in db_cart_items:
        menu_item = item.menu_item or MenuItem.query.get(item.menu_id)
        if menu_item:
            cart_items.append({
                'price': float(menu_item.price) if menu_item.price else 0.0,
                'qty': item.quantity or 1
            })

    bill_details = _calculate_bill(cart_items, coupon_code)

    if coupon_code and not bill_details['applied_coupon']:
        return jsonify(success=False, message="Invalid coupon or minimum order criteria not met."), 400

    return jsonify(success=True, bill=bill_details)
# ---------------------------------------------------------------------
# Keep your existing endpoints above:
# - api_add_to_cart
# - api_update_cart_qty
# - api_apply_coupon
# ---------------------------------------------------------------------

# PASTE THE NEW CHECKOUT ENDPOINTS HERE AT THE BOTTOM:

# ==========================================
# Task 2: "See All" Categorized Food List Route
# Add this at the bottom of routes/customer.py
# ==========================================
@customer_bp.route('/food-list')
@customer_login_required
def food_list():
    category_filter = request.args.get('category')
    
    items = []
    businesses = []
    
    if category_filter == 'most_loved':
        # Same historical-order rule used by the dashboard.
        # Current cart contents are never used for popularity.
        popular_rows = (
            db.session.query(
                MenuItem,
                func.sum(OrderItem.quantity).label("total_ordered")
            )
            .join(OrderItem, OrderItem.menu_id == MenuItem.menu_id)
            .join(Order, Order.order_id == OrderItem.order_id)
            .filter(
                MenuItem.is_available == True,
                Order.status == "delivered"
            )
            .group_by(MenuItem.menu_id)
            .order_by(
                desc("total_ordered"),
                MenuItem.menu_id.asc()
            )
            .limit(12)
            .all()
        )
        items = [item for item, _total in popular_rows]
        
    elif category_filter == 'budget_friendly':
        # Explicit filter for items under or equal to ₹80
        items = MenuItem.query.filter(MenuItem.price <= 80).all()
        
    elif category_filter == 'near_me':
        # Use only the customer's saved coordinates; never substitute a hardcoded location.
        user_lat = getattr(current_user, 'latitude', None)
        user_lng = getattr(current_user, 'longitude', None)
        if user_lat is None:
            user_lat = session.get('user_lat')
        if user_lng is None:
            user_lng = session.get('user_lng')

        businesses = []
        try:
            user_lat = float(user_lat) if user_lat is not None else None
            user_lng = float(user_lng) if user_lng is not None else None
        except (TypeError, ValueError):
            user_lat = user_lng = None

        if user_lat is not None and user_lng is not None:
            for biz in Business.query.all():
                if biz.latitude is None or biz.longitude is None:
                    continue
                try:
                    dist = haversine(user_lat, user_lng, float(biz.latitude), float(biz.longitude))
                    biz.distance_km = round(dist, 1)
                    if dist <= 20:
                        businesses.append(biz)
                except (TypeError, ValueError):
                    continue
            businesses.sort(key=lambda b: b.distance_km)
    elif category_filter:
        items = MenuItem.query.filter_by(category=category_filter).all()
        
    else:
        items = MenuItem.query.all()
        
    # ALWAYS ensure a valid response is returned
    return render_template(
        'customer/food_list.html', 
        items=items, 
        businesses=businesses,
        current_category=category_filter,
        current_user=current_user
    )

@customer_bp.route('/businesses')
@customer_login_required
def business_list():
    # "Newly Added Services" page: newest approved businesses first.
    # Each entry carries logo, open/closed state, type, address and starting
    # price (same structure as the category / search cards).
    newest_first = (
        Business.query
        .filter_by(status="active")
        .order_by(Business.created_at.desc())
        .all()
    )
    cards = [_business_card_dict(b) for b in newest_first]
    return render_template('customer/business_list.html', businesses=cards)
    
@customer_bp.route("/api/checkout/cod", methods=["POST"])
@customer_login_required
def api_checkout_cod():
    data = request.get_json() or {}
    coupon_code = data.get("coupon_code", "")

    user_cart = Cart.query.filter_by(customer_id=current_user.customer_id).first()
    if not user_cart or not user_cart.items:
        return jsonify(success=False, message="Your cart is empty."), 400

    cart_items = []
    for item in user_cart.items:
        menu_item = item.menu_item or MenuItem.query.get(item.menu_id)
        if menu_item:
            cart_items.append({
                'price': float(menu_item.price) if menu_item.price else 0.0,
                'qty': item.quantity or 1
            })

    bill = _calculate_bill(cart_items, coupon_code)
    first_item = user_cart.items[0].menu_item or MenuItem.query.get(user_cart.items[0].menu_id)

    # Get delivery type from request data or default to 'delivery'
    delivery_type = data.get("delivery_type") or data.get("deliveryType") or "delivery"

    try:
        new_order = Order(
            customer_id=current_user.customer_id,
            business_id=first_item.business_id if first_item else None,
            total_amount=bill['to_pay'],
            payment_method="cod",         # <-- Explicitly set payment method here!
            delivery_type=delivery_type,  # <-- Explicitly set delivery type here!
            status="PENDING"
        )
        db.session.add(new_order)
        db.session.flush()

        for item in user_cart.items:
            m_item = item.menu_item or MenuItem.query.get(item.menu_id)
            if m_item:
                order_item = OrderItem(
                    order_id=new_order.order_id,
                    menu_id=m_item.menu_id,
                    quantity=item.quantity,
                    price=m_item.price
                )
                db.session.add(order_item)

        new_payment = Payment(
            order_id=new_order.order_id,
            payment_method="COD",
            payment_status="PENDING"
        )
        db.session.add(new_payment)

        CartItem.query.filter_by(cart_id=user_cart.cart_id).delete()
        db.session.commit()

        return jsonify(success=True, order_id=new_order.order_id, total_amount=bill['to_pay'])

    except Exception as e:
        db.session.rollback()
        return jsonify(success=False, message=str(e)), 500


@customer_bp.route("/api/checkout/razorpay/create", methods=["POST"])
@customer_login_required
def api_create_razorpay_order():
    data = request.get_json() or {}
    coupon_code = data.get("coupon_code", "")

    user_cart = Cart.query.filter_by(customer_id=current_user.customer_id).first()
    if not user_cart or not user_cart.items:
        return jsonify(success=False, message="Your cart is empty."), 400

    cart_items = []
    for item in user_cart.items:
        menu_item = item.menu_item or MenuItem.query.get(item.menu_id)
        if menu_item:
            cart_items.append({
                'price': float(menu_item.price) if menu_item.price else 0.0,
                'qty': item.quantity or 1
            })

    bill = _calculate_bill(cart_items, coupon_code)
    amount_in_paise = int(bill['to_pay'] * 100)

    try:
        razorpay_order = razorpay_client.order.create({
            "amount": amount_in_paise,
            "currency": "INR",
            "payment_capture": "1"
        })

        return jsonify(
            success=True,
            razorpay_order_id=razorpay_order["id"],
            amount=amount_in_paise,
            to_pay=bill['to_pay']
        )
    except Exception as e:
        return jsonify(success=False, message=str(e)), 500


@customer_bp.route("/api/checkout/razorpay/verify", methods=["POST"])
@customer_login_required
def api_verify_razorpay_payment():
    data = request.get_json() or {}
    coupon_code = data.get("coupon_code", "")

    params_dict = {

        'razorpay_order_id': data.get('razorpay_order_id'),
        'razorpay_payment_id': data.get('razorpay_payment_id'),
        'razorpay_signature': data.get('razorpay_signature')
    }

    try:
        razorpay_client.utility.verify_payment_signature(params_dict)

        user_cart = Cart.query.filter_by(customer_id=current_user.customer_id).first()
        cart_items = []
        for item in user_cart.items:
            menu_item = item.menu_item or MenuItem.query.get(item.menu_id)
            if menu_item:
                cart_items.append({
                    'price': float(menu_item.price) if menu_item.price else 0.0,
                    'qty': item.quantity or 1
                })

        bill = _calculate_bill(cart_items, coupon_code)
        first_item = user_cart.items[0].menu_item or MenuItem.query.get(user_cart.items[0].menu_id)

        new_order = Order(
            customer_id=current_user.customer_id,
            business_id=first_item.business_id if first_item else None,
            total_amount=bill['to_pay'],
            payment_method="ONLINE",  # 👈 Add this line to satisfy the database constraint!
            delivery_type=data.get("delivery_type", "delivery"),  # 👈 Add this line to satisfy the delivery type constraint!
        )        
        db.session.add(new_order)
        db.session.flush()

        for item in user_cart.items:
            m_item = item.menu_item or MenuItem.query.get(item.menu_id)
            if m_item:
                order_item = OrderItem(
                    order_id=new_order.order_id,
                    menu_id=m_item.menu_id,
                    quantity=item.quantity,
                    price=m_item.price
                )
                db.session.add(order_item)

        new_payment = Payment(
            order_id=new_order.order_id, # Make sure to use your Order's primary key attribute name (e.g., order_id)
            payment_method="ONLINE",
            payment_status="success",  # Must be one of: "pending", "success", "failed", "refunded"
            transaction_id=data.get('razorpay_payment_id')
        )
        db.session.add(new_payment)
        db.session.commit()

        CartItem.query.filter_by(cart_id=user_cart.cart_id).delete()
        db.session.commit()

        return jsonify(success=True, order_id=new_order.order_id)

    except razorpay.errors.SignatureVerificationError:
        return jsonify(success=False, message="Payment signature verification failed."), 400
    except Exception as e:
        db.session.rollback()
        return jsonify(success=False, message=str(e)), 500

# ---------------------------------------------------------------------
# Database-Backed Favorites Page & API
# ---------------------------------------------------------------------

@customer_bp.route("/favorites")
@customer_login_required
def favorites_page():
    """Renders the favorites view."""
    return render_template("customer/favorites.html")


@customer_bp.route("/api/favorites", methods=["GET"])
@customer_login_required
def api_get_favorites():
    """Fetches user favorites directly from MySQL database."""
    fav_records = Favorite.query.filter_by(
        customer_id=current_user.customer_id
    ).order_by(Favorite.created_at.desc()).all()
    
    favorites_list = []
    for fav in fav_records:
        if fav.menu_item:
            item = fav.menu_item
            favorites_list.append({
                "id": item.menu_id,
                "businessId": item.business_id,
                "name": item.food_name,
                "price": float(item.price) if item.price is not None else 0.0,
                "imageUrl": item.image or "",
                "businessName": item.business.business_name if item.business else "Local Kitchen",
                "type": getattr(item, 'food_type', 'veg')
            })

    return jsonify(success=True, favorites=favorites_list)


@customer_bp.route("/api/favorites/toggle", methods=["POST"])
@customer_login_required
def api_toggle_favorite():
    """Toggles favorite state in MySQL database for the logged-in customer."""
    data = _json_body()
    menu_id = data.get("menu_id")
    business_id = data.get("business_id")

    if not menu_id and not business_id:
        return jsonify(success=False, message="Item or Business ID is required."), 400

    existing = Favorite.query.filter_by(
        customer_id=current_user.customer_id,
        menu_id=menu_id,
        business_id=business_id
    ).first()

    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify(success=True, is_favorite=False, message="Removed from favorites")

    new_fav = Favorite(
        customer_id=current_user.customer_id,
        menu_id=menu_id,
        business_id=business_id
    )
    db.session.add(new_fav)
    db.session.commit()
    return jsonify(success=True, is_favorite=True, message="Added to favorites ❤️")


# ---------------------------------------------------------------------
# Orders Page & History API
# ---------------------------------------------------------------------

@customer_bp.route("/orders")
@customer_login_required
def orders_page():
    """Renders the orders history view."""
    return render_template("customer/orders.html")


@customer_bp.route("/tracking")
@customer_login_required
def tracking_page():
    """Renders the live delivery tracking page."""
    return render_template("customer/tracking.html")


@customer_bp.route("/api/orders/my-orders", methods=["GET"])
@customer_login_required
def api_my_orders():
    """Returns past orders belonging ONLY to the currently logged-in customer."""
    orders = (
        Order.query.filter_by(customer_id=current_user.customer_id)
        .order_by(Order.order_id.desc())
        .all()
    )

    orders_data = []
    for order in orders:
        biz_name = order.business.business_name if order.business else "Local Kitchen"
        order_date = order.created_at.strftime("%d %b %Y, %I:%M %p") if getattr(order, 'created_at', None) else "Recent Order"

        orders_data.append({
            "id": order.order_id,
            "businessName": biz_name,
            "totalAmount": float(order.total_amount) if order.total_amount is not None else 0.0,
            "paymentMethod": (order.payment_method or "COD").upper(),
            "paymentStatus": order.payment.payment_status if order.payment else "pending",
            "status": order.status or "placed",
            "deliveryType": order.delivery_type or "delivery",
            "date": order.created_at.isoformat() if getattr(order, 'created_at', None) else "",
            "dateFormatted": order_date,
            "items": [
                {
                    "name": item.menu_item.food_name if item.menu_item else "Menu Item",
                    "menuId": item.menu_id,
                    "quantity": item.quantity or 1,
                    "price": float(item.price) if item.price is not None else 0.0,
                    "reviewed": bool(Review.query.filter_by(
                        customer_id=current_user.customer_id,
                        order_id=order.order_id,
                        menu_id=item.menu_id
                    ).first()),
                    "reviewRating": (lambda r: r.rating if r else 0)(Review.query.filter_by(
                        customer_id=current_user.customer_id,
                        order_id=order.order_id,
                        menu_id=item.menu_id
                    ).first()),
                    "reviewComment": (lambda r: r.review if r else "")(Review.query.filter_by(
                        customer_id=current_user.customer_id,
                        order_id=order.order_id,
                        menu_id=item.menu_id
                    ).first()),
                }
                for item in order.items
            ]
        })

    return jsonify(success=True, orders=orders_data)

# ---------------------------------------------------------------------
# Food Reviews API
# ---------------------------------------------------------------------

@customer_bp.route("/api/reviews", methods=["POST"])
@customer_login_required
def api_submit_food_review():
    data = _json_body() or {}
    try:
        order_id = int(data.get("order_id"))
        menu_id = int(data.get("menu_id"))
        rating = int(data.get("rating"))
    except (TypeError, ValueError):
        return jsonify(success=False, message="Invalid review details."), 400

    comment = (data.get("review") or "").strip()
    if rating < 1 or rating > 5:
        return jsonify(success=False, message="Rating must be between 1 and 5."), 400
    if len(comment) > 1000:
        return jsonify(success=False, message="Review is too long. Please keep it under 1000 characters."), 400

    order = Order.query.filter_by(
        order_id=order_id,
        customer_id=current_user.customer_id
    ).first()
    if not order:
        return jsonify(success=False, message="Order not found."), 404

    if str(order.status).lower() not in ("delivered", "completed", "picked_up"):
        return jsonify(success=False, message="You can review food only after the order is completed."), 400

    order_item = OrderItem.query.filter_by(
        order_id=order_id,
        menu_id=menu_id
    ).first()
    if not order_item:
        return jsonify(success=False, message="This food item was not part of the order."), 400

    existing = Review.query.filter_by(
        customer_id=current_user.customer_id,
        order_id=order_id,
        menu_id=menu_id
    ).first()

    if existing:
        existing.rating = rating
        existing.review = comment
        message = "Review updated successfully!"
    else:
        existing = Review(
            customer_id=current_user.customer_id,
            business_id=order.business_id,
            order_id=order_id,
            menu_id=menu_id,
            rating=rating,
            review=comment
        )
        db.session.add(existing)
        message = "Review submitted successfully!"

    db.session.commit()
    return jsonify(success=True, message=message, review_id=existing.review_id)


# ---------------------------------------------------------------------
# Live Delivery Location API
# ---------------------------------------------------------------------


@customer_bp.route("/api/orders/<int:order_id>/location", methods=["GET"])
@customer_login_required
def api_order_delivery_location(order_id):
    # Make sure this order belongs to the logged-in customer
    order = Order.query.filter_by(
        order_id=order_id,
        customer_id=current_user.customer_id
    ).first()

    if not order:
        return jsonify(
            success=False,
            message="Order not found."
        ), 404

    # Location is only available while the order is out for delivery
    if order.status != "out_for_delivery":
        return jsonify(
            success=False,
            message="Live delivery location is not available for this order yet."
        ), 400

    location = OrderDeliveryLocation.query.filter_by(
        order_id=order.order_id
    ).first()

    if not location:
        return jsonify(
            success=False,
            message="Delivery location is not available yet."
        ), 404

    return jsonify(
        success=True,
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
# ---------------------------------------------------------------------
# Address Management API
# ---------------------------------------------------------------------

@customer_bp.route("/api/address/update", methods=["POST"])
@customer_login_required
def api_update_address():
    data = _json_body()
    new_address = (data.get("address") or "").strip()

    if not new_address:
        return jsonify(success=False, message="Address cannot be empty."), 400

    current_user.address = new_address
    db.session.commit()

    return jsonify(success=True, message="Address saved successfully.", address=new_address)


# ---------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------

@customer_bp.route("/logout", methods=["POST"])
def logout():
    logout_user()
    return jsonify(success=True, redirect=url_for("customer.login"))


# ---------------------------------------------------------------------
# Protected customer pages
# ---------------------------------------------------------------------
@customer_bp.route("/dashboard")
@customer_login_required
def dashboard():
    # Use the logged-in customer's saved coordinates or session coordinates.
    # Hardcoded fallback coordinates caused Near Me to show the wrong area.
    user_lat = getattr(current_user, 'latitude', None)
    user_lng = getattr(current_user, 'longitude', None)
    if user_lat is None:
        user_lat = session.get('user_lat')
    if user_lng is None:
        user_lng = session.get('user_lng')

    nearby_businesses = []
    try:
        user_lat = float(user_lat) if user_lat is not None else None
        user_lng = float(user_lng) if user_lng is not None else None
    except (TypeError, ValueError):
        user_lat = user_lng = None

    if user_lat is not None and user_lng is not None:
        for biz in Business.query.all():
            # A business without coordinates cannot be considered nearby.
            if biz.latitude is None or biz.longitude is None:
                continue
            try:
                dist = haversine(user_lat, user_lng, float(biz.latitude), float(biz.longitude))
                biz.distance_km = round(dist, 1)
                if dist <= 20:
                    nearby_businesses.append(biz)
            except (TypeError, ValueError):
                continue

        nearby_businesses.sort(key=lambda b: b.distance_km)
    nearby_businesses = nearby_businesses[:6]

    # -------------------------------------------------------------
    # Most Ordered & Loved
    # -------------------------------------------------------------
    # IMPORTANT: This section is based ONLY on completed historical
    # orders. The customer's current cart is never used to decide
    # which foods appear here.
    #
    # We count quantities from delivered orders across all customers,
    # then take the top 3 available menu items.
    popular_rows = (
        db.session.query(
            MenuItem,
            func.sum(OrderItem.quantity).label("total_ordered")
        )
        .join(OrderItem, OrderItem.menu_id == MenuItem.menu_id)
        .join(Order, Order.order_id == OrderItem.order_id)
        .filter(
            MenuItem.is_available == True,
            Order.status == "delivered"
        )
        .group_by(MenuItem.menu_id)
        .order_by(
            desc("total_ordered"),
            MenuItem.menu_id.asc()
        )
        .limit(3)
        .all()
    )

    most_ordered_items = [item for item, _total in popular_rows]

    # Current cart quantity is ONLY displayed on the ADD/quantity
    # control. It has absolutely no effect on the 3 selected items.
    user_cart = (
        Cart.query
        .filter_by(customer_id=current_user.customer_id)
        .order_by(Cart.cart_id.desc())
        .first()
    )

    current_cart_quantities = {}
    if user_cart:
        current_cart_quantities = {
            cart_item.menu_id: cart_item.quantity
            for cart_item in CartItem.query.filter_by(
                cart_id=user_cart.cart_id
            ).all()
        }

    for item in most_ordered_items:
        item.current_cart_qty = current_cart_quantities.get(
            item.menu_id,
            0
        )

    # Fetch remaining sections for your template
    budget_items = MenuItem.query.filter(
        MenuItem.price <= 80,
        MenuItem.is_available == True
    ).limit(6).all()
    
    # Safe fetch for newly added businesses
    newly_added_businesses = Business.query.order_by(Business.created_at.desc()).limit(6).all() if hasattr(Business, 'created_at') else Business.query.limit(6).all()

    return render_template(
        'customer/dashboard.html',
        nearby_businesses=nearby_businesses,
        has_user_location=(user_lat is not None and user_lng is not None),
        most_ordered_items=most_ordered_items,
        budget_items=budget_items,
        newly_added_businesses=newly_added_businesses
    )

@customer_bp.route('/search')
@customer_login_required
def search():
    category_filter = request.args.get('category')
    query = request.args.get('q', '').strip()
    
    category_mapping = {
        'mess': 'Mess',
        'home_kitchen': 'Home Kitchen',
        'tiffin_service': 'Tiffin Service',
        'canteen': 'Canteen',
        'college_canteen': 'Canteen',
        'poli_bhaji_kendra': 'Poli Bhaji Kendra',
        'festival_food': 'Festival Seller',
        'festival_seller': 'Festival Seller'
    }
    
    businesses = []
    
    
    print(f"DEBUG ---> category_filter received: {category_filter}")
    print(f"DEBUG ---> query received: {query}")
    
    # Print all businesses in the database to see what their business_type actually is!
    all_b = Business.query.all()
    for b in all_b:
        print(f"DEBUG DB BIZ ---> Name: {b.business_name}, Type: {b.business_type}")
    
    if category_filter:
        clean_filter = category_filter.lower().strip()
        target_type = category_mapping.get(clean_filter, category_filter)
        
        # Use ilike with wildcards so "Festival Seller" matches cleanly
        businesses = Business.query.filter(
            Business.business_type.ilike(f"%{target_type}%")
        ).all()
        
    elif query:
        # Also let text searches catch category names or business names
        businesses = Business.query.filter(
            (Business.business_name.ilike(f"%{query}%")) | 
            (Business.business_type.ilike(f"%{query}%"))
        ).all()
        
    return render_template(
        'customer/search.html', 
        businesses=businesses, 
        current_category=category_filter,
        query=query
    )

@customer_bp.route('/api/customer/location', methods=['POST'], endpoint='save_customer_location')
@customer_login_required
def update_location_api():
    data = request.get_json() or {}
    lat = data.get('latitude')
    lng = data.get('longitude')
    address_name = data.get('location_name')

    # Use the helper method defined in your Customer model!
    if lat is not None and lng is not None:
        current_user.update_location(lat, lng, address_name)
        db.session.commit()

    # Also keep them in session as a fallback
    session['user_lat'] = lat
    session['user_lng'] = lng
    
    return jsonify({"success": True, "message": "Location updated successfully!"})



@customer_bp.route("/category")
@customer_login_required
def category():
    return render_template("customer/category.html")




@customer_bp.route("/food-details", defaults={"business_id": None})
@customer_bp.route("/food-details/<int:business_id>")
@customer_login_required
def food_details(business_id):
    # Check if business_id was passed via query parameter (?biz=... or ?business_id=...)
    if not business_id:
        business_id = request.args.get("biz", type=int) or request.args.get("business_id", type=int)

    business = Business.query.get(business_id) if business_id else None
    items = (
        MenuItem.query.filter_by(business_id=business_id, is_available=True).all()
        if business_id
        else []
    )
    
    # Make sure you are passing 'business' and 'items' to your template!
    return render_template("customer/food-details.html", business=business, items=items)
@customer_bp.route("/policy")
@customer_login_required
def policy():
    return render_template("customer/policy.html")


@customer_bp.route("/help")
@customer_login_required
def help():
    return render_template("customer/help.html")


@customer_bp.route("/profile")
@customer_login_required
def profile():
    # Fetch the logged in customer instance from MySQL
    customer = Customer.query.get(current_user.customer_id)

    return render_template(
        "customer/profile.html",
        customer=customer,
    )

@customer_bp.route("/profile", methods=["POST"])
@customer_login_required
def profile_update():
    data = _json_body()

    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()
    address = (data.get("address") or "").strip()

    if not full_name:
        return jsonify(success=False, message="Please enter your full name."), 400
    if not email:
        return jsonify(success=False, message="Please enter your email address."), 400
    if not phone:
        return jsonify(success=False, message="Please enter your mobile number."), 400

    # Email must stay unique across customers — just not necessarily
    # *this* customer's own current row.
    existing = Customer.query.filter(
        Customer.email == email, Customer.customer_id != current_user.customer_id
    ).first()
    if existing:
        return jsonify(success=False, message="Another account already uses that email."), 409

    customer = Customer.query.get(current_user.customer_id)
    customer.full_name = full_name
    customer.email = email
    customer.phone = phone
    customer.address = address
    db.session.commit()

    return jsonify(success=True, message="Profile updated successfully.")


# ---------------------------------------------------------------------
# Business Browsing API
# ---------------------------------------------------------------------

BUSINESS_TYPE_LABELS = {
    "mess": "Mess",
    "home_kitchen": "Home Kitchen",
    "tiffin_service": "Tiffin Service",
    "canteen": "Canteen",
    "poli_bhaji_kendra": "Poli Bhaji Kendra",
    "festival_seller": "Festival Seller",
}


def _is_open_now(business):
    if not business.opening_time or not business.closing_time:
        return None
    now = datetime.now().time()
    if business.opening_time <= business.closing_time:
        return business.opening_time <= now <= business.closing_time
    return now >= business.opening_time or now <= business.closing_time


def _starting_price(business):
    available_prices = [
        float(item.price) for item in business.menu_items if item.is_available and item.price is not None
    ]
    return min(available_prices) if available_prices else None


def _hours_label(business):
    if not business.opening_time or not business.closing_time:
        return ""
    return (
        f"{business.opening_time.strftime('%I:%M %p')} - "
        f"{business.closing_time.strftime('%I:%M %p')}"
    )


@customer_bp.route("/uploads/business-logo/<path:filename>")
@customer_login_required
def customer_business_logo(filename):
    """Serve a business logo to logged-in customers."""
    directory = current_app.config.get("BUSINESS_LOGO_UPLOAD_FOLDER")
    if not directory:
        return "", 404
    return send_from_directory(directory, filename)


def _business_card_dict(business):
    return {
        "id": business.business_id,
        "name": business.business_name,
        "type": business.business_type,
        "typeLabel": BUSINESS_TYPE_LABELS.get(business.business_type, business.business_type),
        "address": business.address or "",
        "logoUrl": (
            url_for(
                "customer.customer_business_logo",
                filename=business.logo_path
            )
            if getattr(business, "logo_path", None)
            else ""
        ),
        "open": _is_open_now(business),
        "hours": _hours_label(business),
        "startingPrice": _starting_price(business),
        "menuItemCount": sum(1 for i in business.menu_items if i.is_available),
    }


@customer_bp.route("/api/businesses", methods=["GET"])
@customer_login_required
def api_businesses_list():
    query = Business.query

    # CRITICAL: Read 'category' (or 'type') from request arguments
    category_param = (request.args.get("category") or request.args.get("type") or "").strip()
    
    if category_param:
        # Filter directly by the exact database string (e.g., 'festival_seller')
        query = query.filter(Business.business_type == category_param)

    search_term = (request.args.get("q") or "").strip()
    if search_term:
        like = f"%{search_term}%"
        query = query.filter(
            db.or_(
                Business.business_name.ilike(like), 
                Business.address.ilike(like),
                Business.business_type.ilike(like)
            )
        )

    businesses = query.order_by(Business.business_id.desc()).all()
    results = [_business_card_dict(b) for b in businesses]

    max_price_param = request.args.get("max_price") or request.args.get("budget")
    if max_price_param:
        try:
            limit = float(max_price_param)
            results = [
                b for b in results 
                if b.get("startingPrice") is not None and b["startingPrice"] <= limit
            ]
        except (ValueError, TypeError):
            pass

    return jsonify(businesses=results)
                    

@customer_bp.route("/api/food-items", methods=["GET"])
@customer_login_required
def api_food_items_list():
    query = MenuItem.query.join(Business).filter(
        MenuItem.is_available == True,
        Business.status == "active"
    )

    max_price_param = request.args.get("max_price") or request.args.get("budget")
    if max_price_param:
        try:
            limit = float(max_price_param)
            query = query.filter(MenuItem.price <= limit)
        except (ValueError, TypeError):
            pass

    search_term = (request.args.get("q") or "").strip()
    if search_term and not any(kw in search_term.lower() for kw in ["under", "below", "budget"]):
        like = f"%{search_term}%"
        query = query.filter(MenuItem.food_name.ilike(like))

    items = query.order_by(MenuItem.price.asc()).all()

    food_list = [
        {
            "id": item.menu_id,
            "businessId": item.business_id,
            "name": item.food_name,
            "price": float(item.price) if item.price is not None else 0.0,
            "imageUrl": item.image or "",
            "businessName": item.business.business_name if item.business else "Local Kitchen",
            "type": getattr(item, 'food_type', None) or getattr(item, 'type', 'veg') or 'veg'
        }
        for item in items
    ]

    return jsonify(items=food_list)


@customer_bp.route("/api/businesses/<business_id>", methods=["GET"])
@customer_login_required
def api_business_detail(business_id):
    biz_obj = None

    try:
        biz_id = int(business_id)
        biz_obj = Business.query.filter_by(business_id=biz_id, status="active").first()
    except (ValueError, TypeError):
        pass

    if not biz_obj:
        try:
            menu_item = MenuItem.query.get(int(business_id))
            if menu_item and menu_item.business:
                biz_obj = menu_item.business
        except (ValueError, TypeError):
            pass

    if not biz_obj or biz_obj.status != "active":
        return jsonify(success=False, message="Business details not found."), 404

    menu = [
        {
            "id": str(item.menu_id),
            "name": item.food_name,
            "category": item.category.slug if item.category else "",
            "categoryLabel": item.category.category_name if item.category else "",
            "price": float(item.price) if item.price is not None else 0.0,
            "type": getattr(item, 'food_type', None) or getattr(item, 'type', 'veg') or 'veg',
            "prepTime": getattr(item, 'prep_time_minutes', 0),
            "desc": item.description or "",
            "imageUrl": item.image or "",
        }
        for item in biz_obj.menu_items
        if item.is_available
    ]

    detail = _business_card_dict(biz_obj)
    detail.update({
        "description": biz_obj.description or "",
        "phone": biz_obj.phone,
        "email": biz_obj.email,
        "reviews": [],
        "menu": menu,
    })
    return jsonify(success=True, business=detail)


# ---------------------------------------------------------------------
# Checkout & Payment APIs
# ---------------------------------------------------------------------

def _order_dict(order):
    return {
        "id": order.order_id,
        "businessId": order.business_id,
        "businessName": order.business.business_name if order.business else "Local Kitchen",
        "totalAmount": float(order.total_amount) if order.total_amount is not None else 0.0,
        "paymentMethod": order.payment_method,
        "deliveryType": order.delivery_type,
        "status": order.status,
        "paymentStatus": order.payment.payment_status if order.payment else "pending",
        "items": [
            {
                "name": item.menu_item.food_name if item.menu_item else "Item no longer on menu",
                "menuId": item.menu_id,
                "quantity": item.quantity,
                "price": float(item.price) if item.price is not None else 0.0,
            }
            for item in order.items
        ],
    }


@customer_bp.route("/api/checkout", methods=["POST"])
@customer_login_required
def api_checkout():
    data = _json_body() or {}

    delivery_type = (
        data.get("deliveryType") or
        data.get("delivery_type") or
        "delivery"
    ).strip().lower()

    if delivery_type not in ("delivery", "pickup"):
        delivery_type = "delivery"

    raw_payment = (
        data.get("paymentMethod") or
        data.get("payment_method") or
        "cod"
    )

    payment_method = str(raw_payment).strip().lower()

    if payment_method in ("cash on delivery", "cod"):
        payment_method = "cod"
    elif payment_method in ("online", "razorpay", "pay online", "card"):
        payment_method = "online"
    else:
        payment_method = "cod"

    # Get customer's cart from database
    user_cart = Cart.query.filter_by(
        customer_id=current_user.customer_id
    ).order_by(Cart.cart_id.desc()).first()

    if not user_cart:
        return jsonify(
            success=False,
            message="Your cart is empty."
        ), 400

    db_cart_items = CartItem.query.filter_by(
        cart_id=user_cart.cart_id
    ).all()

    if not db_cart_items:
        return jsonify(
            success=False,
            message="Your cart is empty."
        ), 400

    # Make sure all cart items belong to the same business
    first_menu_item = (
        db_cart_items[0].menu_item
        or MenuItem.query.get(db_cart_items[0].menu_id)
    )

    if not first_menu_item:
        return jsonify(
            success=False,
            message="One of the items in your cart is no longer available."
        ), 400

    business = Business.query.filter_by(
        business_id=first_menu_item.business_id,
        status="active"
    ).first()

    if not business:
        return jsonify(
            success=False,
            message="This business is not available."
        ), 404

    # Prepare items for bill calculation
    cart_items_for_bill = []

    for cart_item in db_cart_items:
        menu_item = (
            cart_item.menu_item
            or MenuItem.query.get(cart_item.menu_id)
        )

        if not menu_item:
            return jsonify(
                success=False,
                message="One of the items in your cart is no longer available."
            ), 400

        if not menu_item.is_available:
            return jsonify(
                success=False,
                message=(
                    f"{menu_item.food_name} is currently unavailable. "
                    "Please refresh your cart."
                )
            ), 400

        cart_items_for_bill.append({
            "id": menu_item.menu_id,
            "name": menu_item.food_name,
            "price": float(menu_item.price) if menu_item.price else 0.0,
            "qty": cart_item.quantity or 1
        })

    coupon_code = data.get("coupon_code", "")

    bill = _calculate_bill(
        cart_items_for_bill,
        coupon_code
    )

    order_items = []

    for cart_item in db_cart_items:
        menu_item = (
            cart_item.menu_item
            or MenuItem.query.get(cart_item.menu_id)
        )

        qty = cart_item.quantity or 1

        if qty <= 0:
            continue

        order_items.append(
            OrderItem(
                menu_id=menu_item.menu_id,
                quantity=qty,
                price=menu_item.price
            )
        )

    if not order_items:
        return jsonify(
            success=False,
            message="Your cart is empty."
        ), 400

    try:
        # Create ONE order
        order = Order(
            customer_id=current_user.customer_id,
            business_id=business.business_id,
            total_amount=bill["to_pay"],
            payment_method=payment_method,
            delivery_type=delivery_type,
            status="pending"
        )

        # Add order items
        order.items = order_items

        # Create payment record
        order.payment = Payment(
            payment_method=payment_method,
            payment_status="pending"
        )

        # First tracking status
        order.status_history = [
            OrderStatusHistory(status="pending")
        ]

        db.session.add(order)

        # Save order first so we get its ID
        db.session.flush()

        # Clear customer's cart
        CartItem.query.filter_by(
            cart_id=user_cart.cart_id
        ).delete()

        db.session.commit()

        return jsonify(
            success=True,
            order=_order_dict(order)
        )

    except Exception as e:
        db.session.rollback()

        return jsonify(
            success=False,
            message="Could not place the order.",
            error=str(e)
        ), 500
        
    # ───────────────────────────────────────────────────

@customer_bp.route("/payment")
@customer_login_required
def payment_page():
    return render_template("customer/payment.html")


@customer_bp.route("/api/orders/<int:order_id>", methods=["GET"])
@customer_login_required
def api_order_detail(order_id):
    order = Order.query.filter_by(
        order_id=order_id, customer_id=current_user.customer_id
    ).first()
    if not order:
        return jsonify(success=False, message="Order not found."), 404
    return jsonify(order=_order_dict(order))


@customer_bp.route("/api/orders/<int:order_id>/confirm-cod", methods=["POST"])
@customer_login_required
def api_confirm_cod(order_id):
    order = Order.query.filter_by(
        order_id=order_id, customer_id=current_user.customer_id
    ).first()
    if not order:
        return jsonify(success=False, message="Order not found."), 404
    if order.payment_method != "cod":
        return jsonify(success=False, message="This order isn't a Cash on Delivery order."), 400

    order.status_history.append(OrderStatusHistory(status="confirmed"))

    # --- CLEAR THE CART AFTER SUCCESSFUL COD CONFIRMATION ---
    user_cart = Cart.query.filter_by(customer_id=current_user.customer_id).first()
    if user_cart:
        CartItem.query.filter_by(cart_id=user_cart.cart_id).delete()
    # --------------------------------------------------------

    db.session.commit()
    return jsonify(success=True, order=_order_dict(order))


def _razorpay_client():
    key_id = current_app.config.get("RAZORPAY_KEY_ID")
    key_secret = current_app.config.get("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret:
        return None, None, None
    import razorpay
    return razorpay.Client(auth=(key_id, key_secret)), key_id, key_secret


@customer_bp.route("/api/orders/<int:order_id>/razorpay-order", methods=["POST"])
@customer_login_required
def api_razorpay_create_order(order_id):
    order = Order.query.filter_by(
        order_id=order_id, customer_id=current_user.customer_id
    ).first()
    if not order:
        return jsonify(success=False, message="Order not found."), 404
    if order.payment_method != "online":
        return jsonify(success=False, message="This order isn't set up for online payment."), 400

    client, key_id, _ = _razorpay_client()
    if not client:
        return jsonify(success=False, message=(
            "Online payment isn't configured on this server yet "
            "(missing RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET). "
            "Please choose Cash on Delivery instead."
        )), 400

    amount_paise = int(round((float(order.total_amount) if order.total_amount is not None else 0.0) * 100))
    try:
        razorpay_order = client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": f"order_{order.order_id}",
            "payment_capture": 1,
        })
    except Exception as e:
        return jsonify(success=False, message=f"Could not start payment: {e}"), 502

    order.payment.transaction_id = razorpay_order["id"]
    db.session.commit()

    return jsonify(
        success=True,
        keyId=key_id,
        razorpayOrderId=razorpay_order["id"],
        amount=amount_paise,
        currency="INR",
        customerName=current_user.full_name,
        customerEmail=current_user.email,
        customerPhone=current_user.phone,
        businessName=order.business.business_name if order.business else "Local Kitchen",
    )


@customer_bp.route("/api/orders/<int:order_id>/razorpay-verify", methods=["POST"])
@customer_login_required
def api_razorpay_verify(order_id):
    order = Order.query.filter_by(
        order_id=order_id, customer_id=current_user.customer_id
    ).first()
    if not order:
        return jsonify(success=False, message="Order not found."), 404

    client, _, key_secret = _razorpay_client()
    if not client:
        return jsonify(success=False, message="Online payment isn't configured on this server."), 400

    data = _json_body()
    params = {
        "razorpay_order_id": data.get("razorpay_order_id"),
        "razorpay_payment_id": data.get("razorpay_payment_id"),
        "razorpay_signature": data.get("razorpay_signature"),
    }

    try:
        client.utility.verify_payment_signature(params)
    except Exception:
        order.payment.payment_status = "failed"
        db.session.commit()
        return jsonify(success=False, message="Payment verification failed."), 400

    order.payment.payment_status = "success"
    order.payment.transaction_id = params["razorpay_payment_id"]
    order.status_history.append(OrderStatusHistory(status="confirmed"))
    db.session.commit()

    return jsonify(success=True, order=_order_dict(order))
    # ---------------------------------------------------------------------
# Location Tracking API
# ---------------------------------------------------------------------

@customer_bp.route("/update-location", methods=["POST"])
@customer_login_required
def update_location():
    data = _json_body()
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    address = data.get("address")

    if latitude is None or longitude is None:
        return jsonify(success=False, message="Latitude and longitude are required."), 400

    try:
        current_user.update_location(latitude, longitude, address=address)
        db.session.commit()
        return jsonify(success=True, message="Location updated successfully.")
    except Exception as e:
        db.session.rollback()
        return jsonify(success=False, message="Failed to save location."), 500