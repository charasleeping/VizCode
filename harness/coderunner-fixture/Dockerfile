FROM moodlehq/moodle-php-apache:8.3@sha256:501f19fa75ad3cdc8962f2a742f39d179b8aa8ffdc2ff233d8d27a32f14e0e05
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
COPY --chown=www-data:www-data harness/upstream-moodle /var/www/html
COPY --chown=www-data:www-data harness/upstream-coderunner /var/www/html/question/type/coderunner
COPY --chown=www-data:www-data harness/upstream-behaviour /var/www/html/question/behaviour/adaptive_adapted_for_coderunner
COPY dist/vizcode.zip /tmp/vizcode.zip
RUN unzip -q /tmp/vizcode.zip -d /var/www/html/local && rm /tmp/vizcode.zip && chown -R www-data:www-data /var/www/html/local/vizcode
RUN python3 /var/www/html/local/vizcode/bridge/install.py --moodle /var/www/html && \
    mkdir -p /var/moodledata /var/moodleconfig && \
    ln -s /var/moodleconfig/config.php /var/www/html/config.php && \
    chown -h www-data:www-data /var/www/html/config.php && chown -R www-data:www-data /var/moodledata /var/moodleconfig
COPY harness/coderunner-fixture/*.php /fixture/
