[Dashboard](https://app.deepsource.com/dashboard) [Resources](https://docs.deepsource.com/docs) [Pricing](https://deepsource.com/pricing) [Directory](https://deepsource.com/directory) [Log in](https://app.deepsource.com/login)

## ejjays/  nexstream

CODE ANALYSIS ACTIVE


SCA INACTIVE


[Overview](https://app.deepsource.com/gh/ejjays/nexstream) [Issues](https://app.deepsource.com/gh/ejjays/nexstream/issues) [Metrics](https://app.deepsource.com/gh/ejjays/nexstream/metrics) [History](https://app.deepsource.com/gh/ejjays/nexstream/history/pull-requests?state=OPEN)

/[All issues](https://app.deepsource.com/gh/ejjays/nexstream/issues)/JS-0356

Found unused variables in TypeScript codeJS-0356

Performance

Major

2 hours ago
—
9 days old

[Occurrences\\
1](https://app.deepsource.com/gh/ejjays/nexstream/issue/JS-0356/occurrences) [Ignore rules](https://app.deepsource.com/gh/ejjays/nexstream/issue/JS-0356/ignore-rules)


Sort



Sort


'startResolve' is assigned a value but never used

Major

[JS-0356](https://app.deepsource.com/gh/ejjays/nexstream/issue/JS-0356/occurrences?listindex=0)

```
 38  const spotifyService = spotifyModule as SpotifyService;
 39
 40  // resolve spotify track
 41  const startResolve = Date.now(); 42  const spotifyData: SpotifyData = await spotifyService.resolveSpotifyToYoutube(
 43    url,
 44    [],
```

[backend/src/services/extractors/spotify.ts](https://github.com/ejjays/nexstream/blob/main/backend/src/services/extractors/spotify.ts#L41-L41)

Description


Unused variables are generally considered a code smell and should be avoided.

Removing unused references
\- It prevents unused modules from being loaded at runtime, improving performance, and preventing the compiler from loading metadata that will never be used.
\- It prevents conflicts that may occur when trying to reference another variable.

**NOTE:** If you have intentionally left a variable unused, we suggest you to prefix the variable name with a `_` to prevent them from being flagged by DeepSource.

### Bad Practice

```
import fs from 'fs' // <- unused
import { readFileSync } from 'fs'

const text = readFileSync('declaration_of_independence.txt', 'utf-8')
console.log(text)
```

### Recommended

```
import { readFileSync } from 'fs'

const text = readFileSync('declaration_of_independence.txt', 'utf-8')
console.log(text)
```