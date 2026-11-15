# Install VizCode for CodeRunner

**VizCode requires CodeRunner.** Follow the included `docs/INSTALL.md`
for supported versions, server commands and configuration.

1. Verify `SHA256SUMS` with `sha256sum -c SHA256SUMS` or an equivalent tool.
2. Install `plugins/vizcode.zip`, then apply and verify its integration bridge.
3. Configure and start the execution service on a separate HTTPS hostname.
4. Enter the broker URL and matching Java signing key in Moodle's VizCode settings.
5. Edit a CodeRunner question: **Customise → UI plugin → VizCode**. Save and preview.

Existing sites can keep their configured Jobe grader; the supplied grader is
optional. This bundle contains no Moodle database and creates no demo accounts.

Start with `README.md`; student and teacher guidance is in `docs/USAGE.md`.
