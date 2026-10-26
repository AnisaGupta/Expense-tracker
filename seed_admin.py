from app import app, db
from models import Admin
from werkzeug.security import generate_password_hash

with app.app_context():
    admin = Admin.query.filter_by(username="LB@admin2026").first()
    if not admin:
        admin = Admin(
            username="LB@admin2026",
            password=generate_password_hash("Admin2026")
        )
        db.session.add(admin)
        print("Created Admin user: LB@admin2026")
    else:
        admin.password = generate_password_hash("Admin2026")
        print("Updated Admin password to: Admin2026")

    db.session.commit()
    print("Admin setup complete!")
