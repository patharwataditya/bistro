"""Operational commands: `python -m app.cli sync | bootstrap | demo | purge-idempotency`."""

import argparse
import os
import sys

from app.core.config import get_settings
from app.core.db import session_factory
from app.seed import bootstrap, seed_demo, sync_reference_data
from app.services.idempotency import purge_expired


def main() -> int:
    parser = argparse.ArgumentParser(prog="bistro")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("sync", help="Sync permission catalog (safe to run on every deploy)")
    boot = sub.add_parser("bootstrap", help="Create the first restaurant and owner")
    boot.add_argument("--restaurant", required=True)
    boot.add_argument("--location", required=True)
    boot.add_argument("--timezone", default="UTC")
    boot.add_argument("--currency", default="USD")
    boot.add_argument("--owner-username", required=True)
    boot.add_argument("--owner-name", required=True)
    sub.add_parser("demo", help="Load demo data (development only)")
    sub.add_parser("purge-idempotency", help="Delete idempotency records older than 48h")
    args = parser.parse_args()

    with session_factory()() as db, db.begin():
        if args.command == "sync":
            sync_reference_data(db)
        elif args.command == "bootstrap":
            password = os.environ.get("BISTRO_OWNER_PASSWORD")
            if not password or len(password) < 12:
                print("Set BISTRO_OWNER_PASSWORD (12+ chars) in the environment.", file=sys.stderr)
                return 2
            bootstrap(db, restaurant_name=args.restaurant, location_name=args.location,
                      timezone=args.timezone, currency_code=args.currency.upper(),
                      owner_username=args.owner_username, owner_full_name=args.owner_name,
                      owner_password=password)
        elif args.command == "demo":
            if get_settings().is_production:
                print("Refusing to load demo data in production.", file=sys.stderr)
                return 2
            seed_demo(db)
        elif args.command == "purge-idempotency":
            print(f"purged {purge_expired(db)}")
    print(f"{args.command}: done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
