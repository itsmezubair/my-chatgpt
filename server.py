from flask import Flask, request, jsonify, render_template
from main import ask_agent_full
import os

app = Flask(__name__)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json()
    user_input = data.get("prompt", "")
    history = data.get("history", [])

    # Append current user message to history
    history.append({"role": "user", "content": user_input})

    reply = ask_agent_full(history)
    return jsonify({"response": reply})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)
