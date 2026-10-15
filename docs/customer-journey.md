# C1–C11 Customer Journey

Completed against the locked AGENTS.md contract. The existing branding, prices, shared ticket and role structure are preserved.

| Screen              | Route                   | Verified behaviour                                                                           |
| ------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| C1 Home             | `/`                     | Locked hero, nearby stall, street explanation, active order and reorder                      |
| C2 Choose Your Kota | `/menu`                 | Exactly six products with specified names and prices                                         |
| C3 Customise        | `/menu/russian`         | Included ingredients, eight extras, quantity and live total                                  |
| C4 Spaza            | `/spaza`                | Six products, milk added to the same ticket                                                  |
| C5 Tavern           | `/tavern`               | Eight products, Sbu’s ownership, Coke added to the same ticket                               |
| C6 Cart             | `/cart`                 | Separate till groups, editable quantities, R107 total, free delivery and refresh persistence |
| C7 Delivery         | `/checkout/delivery`    | Validated contact/address, saved draft, gate note, radius fee and collection toggle          |
| C8 Payment          | `/checkout/payment`     | Card/EFT/cash choices, R70/R22/R15 split and one mock payment                                |
| C9 Confirmed        | `/orders/:id/confirmed` | Ticket number, total, free delivery, summary, progress and rider contact feedback            |
| C10 Live Track      | `/orders/:id/track`     | Merchant updates from another tab update progress and the current rider stop                 |
| C11 Account         | `/account`              | Saved addresses and gate notes, order history and faithful reorder                           |

## Changes in this pass

- Saved address edits persist after selecting another address or refreshing. Existing v1 sessions gain the address book without losing orders or cart contents.
- Delivery-form drafts persist, with the same validation used at the mock payment boundary.
- Cart and payment flag unavailable items before checkout and offer a recovery path.
- Customer status text follows preparation, each rider stop, departure and completion.
- Collection orders show collection shops instead of a rider route. Cancelled orders show no moving rider or estimated arrival.
- Progress and current-stop indicators expose accessible step information.

## Verification

Production build passed. **14 unit tests and 30 browser tests passed**, including all nine original acceptance criteria, eleven C1–C11 checks, three customer edge cases and seven #1048 transaction proofs. Customer journey checks use a 390 × 844 viewport and verify no horizontal overflow. The #1048 engine still explores all 33 reachable fulfilment states.

Run from the repository root in PowerShell:

```powershell
npm.cmd run build
npm.cmd test
$env:PW_PRODUCTION = '1'
npm.cmd run test:e2e
Remove-Item Env:PW_PRODUCTION
```

To test only the customer browser journey, replace the browser command with `npm.cmd run test:e2e -- customer-journey.spec.ts`.

This remains the specified localStorage/mock-API release. Payments, estimated travel times, map positions and rider calls are simulated; multi-device synchronisation and real authentication are not implemented.
