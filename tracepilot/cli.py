import argparse
import json
from pathlib import Path

from .agent import investigate
from .report import markdown
from .tools import load_incidents


def main():
    parser = argparse.ArgumentParser(description="TracePilot incident investigator")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="List synthetic demo incidents")
    run = sub.add_parser("investigate", help="Investigate an incident")
    run.add_argument("incident", nargs="?", default="checkout-pool")
    run.add_argument("--mode", choices=["offline", "ollama"], default="offline")
    run.add_argument("--budget", type=int, default=6)
    run.add_argument("--format", choices=["markdown", "json"], default="markdown")
    run.add_argument("--output", type=Path)
    serve = sub.add_parser("serve", help="Start the local browser demo")
    serve.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if args.command == "list":
        for incident in load_incidents():
            print(f"{incident['id']:22} {incident['title']}")
    elif args.command == "serve":
        from .server import serve
        serve(args.port)
    else:
        try:
            report = investigate(args.incident, args.mode, args.budget)
        except (ValueError, RuntimeError) as exc:
            parser.exit(2, f"TracePilot: {exc}\n")
        content = json.dumps(report, indent=2) if args.format == "json" else markdown(report)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(content + "\n")
        print(content)


if __name__ == "__main__":
    main()
