# Sugar & Leather Partner Portal - documentation

Developer and operator documentation for the vendor/partner portal, organized by
the [Diátaxis](https://diataxis.fr) framework. Each section serves a different
reader need.

## Tutorials

Learning-oriented walkthroughs. Start here if you are new to the portal.

- [Getting started: run the portal and activate your first partner](tutorials/getting-started.md)

## How-to guides

Task-oriented guides for getting a specific job done.

- [How to run the portal locally](how-to/run-locally.md)
- [How to onboard a partner](how-to/onboard-a-partner.md)
- [How to configure the Aries signup webhook](how-to/configure-the-aries-signup-webhook.md)
- [How to record a partner payout](how-to/record-a-payout.md)
- [How to deploy the portal](how-to/deploy.md)

## Reference

Complete, factual descriptions of the surface you build against.

- [Configuration reference](reference/configuration.md) - every environment variable, local vs Docker
- [Data model reference](reference/data-model.md) - Prisma models, enums, the commission ledger and referral state machines
- [Routes and server actions reference](reference/routes-and-server-actions.md) - pages, API routes, and the server-action mutation surface

## Explanation

Background on why the portal works the way it does.

- [Architecture and design decisions](explanation/architecture.md)
- [How commissions and referral attribution work](explanation/commission-and-attribution.md)
