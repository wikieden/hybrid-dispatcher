import json

import db
import pricing


def create_order_handler(request):
    try:
        payload = json.loads(request.body)
    except Exception:
        return {"status": 500, "body": "error"}

    order_id = db.insert_order(payload)
    price = pricing.final_price(
        payload["qty"], payload["unit_price"], payload.get("loyalty_tier", "none")
    )
    return {"status": 200, "body": {"order_id": order_id, "price": price}}


def get_order_handler(request, order_id):
    order = db.get_order(order_id)
    return {"status": 200, "body": order}


def cancel_order_handler(request, order_id):
    db.delete_order(order_id)
    return {"status": 200, "body": "cancelled"}
