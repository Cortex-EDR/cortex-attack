# ─── cortex-engine ────────────────────────────────────────────────────────────
# A self-contained image with every external binary cortex-cli needs.
# Build:  docker build -t cortex-engine .
# Usage:  docker run --rm cortex-engine nmap -sV localhost
# ──────────────────────────────────────────────────────────────────────────────

FROM alpine:3.20

# ── System packages ──────────────────────────────────────────────────────────
# bash      – default shell / entrypoint
# nmap      – service discovery
# nikto     – web server scanner (needs perl)
# curl      – HTTP probing / header analysis
# perl      – nikto runtime dependency
# python3   – semgrep runtime dependency
# py3-pip   – install semgrep via pip
# git       – needed by some semgrep rule fetches
RUN apk add --no-cache \
    bash \
    nmap \
    nmap-scripts \
    nikto \
    curl \
    perl \
    python3 \
    py3-pip \
    git \
    ca-certificates \
    wget \
    tar

# ── whatweb ───────────────────────────────────────────────────────────────────
# — whatweb
RUN apk add --no-cache ruby wget tar \
    && gem install webrick --no-document \
    && wget https://github.com/urbanadventurer/WhatWeb/archive/refs/tags/v0.5.5.tar.gz \
    && tar -xzf v0.5.5.tar.gz \
    && mv WhatWeb-0.5.5 /opt/whatweb \
    && ln -s /opt/whatweb/whatweb /usr/local/bin/whatweb \
    && rm v0.5.5.tar.gz

# ── semgrep ───────────────────────────────────────────────────────────────────
RUN pip3 install --no-cache-dir --break-system-packages semgrep

# ── trivy ─────────────────────────────────────────────────────────────────────
# Install the latest trivy binary from the official releases
RUN TRIVY_VERSION=$(wget -qO- https://api.github.com/repos/aquasecurity/trivy/releases/latest \
        | grep '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/') \
    && wget -q "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
        -O /tmp/trivy.tar.gz \
    && tar -xzf /tmp/trivy.tar.gz -C /usr/local/bin trivy \
    && rm /tmp/trivy.tar.gz \
    && chmod +x /usr/local/bin/trivy

# ── Entrypoint ────────────────────────────────────────────────────────────────
# Accept the full command as a plain arg list so callers can do:
#   docker run --rm cortex-engine nmap -sV 127.0.0.1
ENTRYPOINT ["/bin/bash", "-c", "$*"]
CMD ["bash"]

# Override bad entrypoint
ENTRYPOINT ["/bin/bash", "-c"]
