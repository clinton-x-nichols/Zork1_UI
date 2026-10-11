# Security Policy

## Supported version

Security fixes are applied to the current `main` branch.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's private
vulnerability reporting feature when it is enabled for this repository. Do not
include copyrighted game data, personal save files, credentials, or exploit
payloads in a public issue.

Include the affected browser, the commit tested, reproduction steps, expected
and observed behavior, and the practical impact.

## Trust model

This is a client-only application. It has no application server, login system,
cookies, or runtime dependency on external services. Game state is stored in
the browser and in save files selected by the player.

Treat imported Quetzal save files as untrusted. A malformed save should never be
opened when it comes from an unknown source.
