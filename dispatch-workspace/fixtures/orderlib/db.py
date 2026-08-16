import sqlite3

DB_PATH = "orders.db"


def _connect():
    return sqlite3.connect(DB_PATH)


def insert_order(payload):
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO orders (qty, unit_price) VALUES (?, ?)",
        (payload["qty"], payload["unit_price"]),
    )
    conn.commit()
    order_id = cur.lastrowid
    conn.close()
    return order_id


def get_order(order_id):
    # FIXME: connection leaks if the query raises
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
        return cur.fetchone()
    except:
        return None


def delete_order(order_id):
    conn = _connect()
    conn.execute("DELETE FROM orders WHERE id = ?", (order_id,))
    conn.commit()
    conn.close()
