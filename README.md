# Commitscape

Live: https://aditya2375.github.io/commitscape/

A public GitHub activity observatory and commit-inspired print generator. Serve the directory with any static HTTP server; no build or dependencies. Fonts are self-hosted with license notices.

## Coverage, not a contribution graph

Live reads fetch at most100repositories,100recent public events, language totals from the first15repositories (three workers), and100commits per selected repository. Requests check HTTP status and3MB parsed text; the overall load cancels after30seconds, commit reads after20seconds. A new lookup cancels the previous load. Partial language failures are counted; no automatic retries spend API quota. GitHub can rate-limit requests. Some repositories or commit histories may be inaccessible or incomplete.

Observed streaks/heatmap count UTC public events only. Loading art does not change activity counts. Events are not commits or contributions. History outside the fetched snapshot is unknown, not zero. Commit art is based on the bounded repository commit response, not complete history or a claim of account ownership.

The bundled @commitscape-demo account, repository links and commits are synthetic. Demo links do not point to invented GitHub pages. Demo prints are synthetic, not real commits. Remote demo-database dependency removed; demo needs no external requests.

## Privacy

Only the last username is stored locally. No GitHub token is accepted, read or transmitted. Earlier versions read `commitscape.token` from browser storage; this version ignores it. If you previously saved one, remove it through browser site-data controls and revoke it at GitHub if no longer needed. This application cannot certify that earlier exposure did not occur. No personal analytics/backend or private-account features.

Support: adityakulkarnicoding@gmail.com
