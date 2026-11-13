# A second, independent MQTT broker (Python, amqtt) with a WebSocket listener, to check that the
# page's own MQTT packets are accepted by more than one implementation. Usage: python3 amqtt_broker.py PORT
import asyncio
import sys

from amqtt.broker import Broker

port = int(sys.argv[1]) if len(sys.argv) > 1 else 9311
config = {
    "listeners": {"default": {"type": "ws", "bind": f"127.0.0.1:{port}"}},
    "plugins": {"amqtt.plugins.authentication.AnonymousAuthPlugin": {"allow_anonymous": True}},
}


async def main():
    broker = Broker(config)
    await broker.start()
    print("ready", flush=True)
    await asyncio.Event().wait()


asyncio.run(main())
