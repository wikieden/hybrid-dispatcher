LOYALTY = {"none": 0.0, "silver": 0.05, "gold": 0.10}


def final_price(qty, unit_price, loyalty_tier):
    subtotal = qty * unit_price
    if qty >= 10:
        subtotal *= 0.9
    discount = LOYALTY[loyalty_tier]
    total = subtotal - subtotal * discount
    if total < 0:
        total = 0
    return round(total)
