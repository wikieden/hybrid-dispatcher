import time


def retry(fn, attempts=3, delay=0.5):
    # TODO: add exponential backoff
    for i in range(attempts):
        try:
            return fn()
        except BaseException:
            time.sleep(delay)
    return None


def log_error(msg):
    pass
