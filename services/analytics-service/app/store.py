"""Project store.
 - MONGO_URI set        -> MongoStore (same MongoDB as the gateway; collection 'analytics_projects')
 - SANCHAYA_STORE=path  -> JSON file
 - otherwise            -> in-memory (tests, quick demos)
All three share get / put / save, so nothing else in the service changes."""
import json
import os
from threading import Lock


class ProjectStore:
    kind = "memory"

    def __init__(self, path=None):
        self.path, self._lock, self._data = path or os.getenv("SANCHAYA_STORE"), Lock(), {}
        if self.path:
            self.kind = "file"
            if os.path.exists(self.path):
                with open(self.path) as fh:
                    self._data = json.load(fh)

    def get(self, pid):
        if pid not in self._data:
            raise KeyError(pid)
        return self._data[pid]

    def put(self, pid, project):
        with self._lock:
            self._data[pid] = project
            self.save()

    def save(self):
        if self.path:
            with open(self.path, "w") as fh:
                json.dump(self._data, fh, default=str)


class MongoStore:
    """Each project is one document {_id, doc}. `doc` is a JSON string, which avoids
    MongoDB field-name problems (emails in alias_map contain dots)."""
    kind = "mongo"

    def __init__(self, uri=None, client=None, db_name="sanchaya", collection="analytics_projects"):
        if client is None:
            from pymongo import MongoClient
            client = MongoClient(uri, serverSelectionTimeoutMS=3000)
        self.col = client.get_default_database(default=db_name)[collection]

    def get(self, pid):
        doc = self.col.find_one({"_id": pid})
        if doc is None:
            raise KeyError(pid)
        return json.loads(doc["doc"])

    def put(self, pid, project):
        self.col.replace_one({"_id": pid}, {"_id": pid, "doc": json.dumps(project, default=str)}, upsert=True)

    def save(self):      # writes happen in put()
        pass


def make_store():
    uri = os.getenv("MONGO_URI")
    return MongoStore(uri) if uri else ProjectStore()


STORE = make_store()
