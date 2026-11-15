# Build Jobe for the Docker host architecture; do not emulate x86 compilers on ARM.
FROM ubuntu:26.04@sha256:6a06111c3b0a8600feadb270aec771dc239bf407b25625f93f44ab00e11f4d3c
ARG JOBE_REVISION=bfca53c0a449815d5c228353260c37b9f6e57f3d
ENV LANG=C.UTF-8
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    acl apache2 build-essential ca-certificates git libapache2-mod-php \
    openjdk-21-jdk-headless php-cli php-mbstring php-intl python3 procps sudo unzip tzdata && \
    rm -rf /var/lib/apt/lists/* && \
    git init /var/www/html/jobe && cd /var/www/html/jobe && \
    git remote add origin https://github.com/trampgeek/jobe.git && \
    git fetch --depth=1 origin "$JOBE_REVISION" && git checkout --detach FETCH_HEAD && \
    printf 'ServerName localhost\n' > /etc/apache2/conf-available/vizcode.conf && a2enconf vizcode && \
    ln -sf /proc/self/fd/1 /var/log/apache2/access.log && \
    ln -sf /proc/self/fd/2 /var/log/apache2/error.log && \
    apache2ctl start && python3 /var/www/html/jobe/install --max_uid=500 && apache2ctl stop && \
    chown root:root /var/www/html/jobe/runguard/runguard /var/www/html/jobe/runguard/rmjobedir && \
    chmod 700 /var/www/html/jobe/runguard/runguard /var/www/html/jobe/runguard/rmjobedir
COPY patch-measurements.py /tmp/patch-measurements.py
RUN python3 /tmp/patch-measurements.py && \
    cd /var/www/html/jobe/runguard && gcc -O2 -o runguard runguard.c -lm && \
    chown root:root runguard && chmod 700 runguard && rm /tmp/patch-measurements.py
EXPOSE 80
HEALTHCHECK --interval=1m --timeout=5s CMD python3 /var/www/html/jobe/minimaltest.py || exit 1
CMD ["/usr/sbin/apache2ctl", "-D", "FOREGROUND"]
