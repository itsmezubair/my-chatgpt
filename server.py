from flask import Flask, request, jsonify, render_template, Response, stream_with_context
from main import ask_agent_stream
import json, os, uuid
from datetime import datetime

app = Flask(__name__)

CONVERSATIONS_DIR = os.path.join(os.path.dirname(__file__), "conversations")
os.makedirs(CONVERSATIONS_DIR, exist_ok=True)

# Current in-memory session
current_session = {"id": None, "messages": []}


def session_file(sid):
    return os.path.join(CONVERSATIONS_DIR, f"{sid}.json")


def save_session(sid, title, messages):
    path = session_file(sid)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["messages"] = messages
    else:
        data = {
            "id": sid,
            "title": title,
            "created_at": datetime.now().isoformat(),
            "messages": messages
        }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def new_session():
    sid = str(uuid.uuid4())[:8]
    current_session["id"] = sid
    current_session["messages"] = []
    return sid


# Start with a fresh session
new_session()


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/sessions", methods=["GET"])
def get_sessions():
    sessions = []
    for fname in sorted(os.listdir(CONVERSATIONS_DIR), reverse=True):
        if fname.endswith(".json"):
            with open(os.path.join(CONVERSATIONS_DIR, fname), "r", encoding="utf-8") as f:
                data = json.load(f)
            sessions.append({
                "id": data["id"],
                "title": data.get("title", "Untitled"),
                "created_at": data.get("created_at", "")
            })
    return jsonify(sessions)


@app.route("/session/<sid>", methods=["GET"])
def load_session(sid):
    path = session_file(sid)
    if not os.path.exists(path):
        return jsonify({"error": "Not found"}), 404
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    current_session["id"] = data["id"]
    current_session["messages"] = data["messages"]
    return jsonify(data)


@app.route("/new", methods=["POST"])
def new_chat():
    new_session()
    return jsonify({"id": current_session["id"]})


@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json()
    user_input = data.get("prompt", "")

    current_session["messages"].append({"role": "user", "content": user_input})

    # Use first user message as title
    title = current_session["messages"][0]["content"][:40]
    sid = current_session["id"]

    def generate():
        full_response = ""
        for chunk in ask_agent_stream(current_session["messages"]):
            full_response += chunk
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"

        current_session["messages"].append({"role": "assistant", "content": full_response})
        save_session(sid, title, current_session["messages"])
        yield f"data: {json.dumps({'done': True, 'session_id': sid, 'title': title})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@app.route("/session/<sid>", methods=["DELETE"])
def delete_session(sid):
    path = session_file(sid)
    if os.path.exists(path):
        os.remove(path)
        if current_session["id"] == sid:
            new_session()
    return jsonify({"ok": True})


@app.route("/clear", methods=["POST"])
def clear():
    new_session()
    return jsonify({"id": current_session["id"]})


if __name__ == "__main__":
    app.run(debug=True)
