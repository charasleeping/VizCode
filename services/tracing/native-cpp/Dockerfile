FROM ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends g++ gdb python3 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY run.py trace.py /opt/vizcode/
USER 10001:10001
ENTRYPOINT ["python3","/opt/vizcode/run.py"]
