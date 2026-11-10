
import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(ENV_FILE)

MONGO_URI = os.getenv("MONGO_URI")
DATABASE_NAME = os.getenv("DATABASE_NAME", "Sanchaya")

if not MONGO_URI:
    raise ValueError("MONGO_URI is missing from services/ai-engine/.env")

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
database = client[DATABASE_NAME]

evidence_collection = database["self_reported_evidence"]


def check_mongodb_connection():
    client.admin.command("ping")
    return True
