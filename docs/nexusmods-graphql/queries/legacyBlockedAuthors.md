# legacyBlockedAuthors

                   This is a legacy endpoint and should not be used.

## Description

Get a list of the current user's ignored users.

## Response

Returns [[User!]](../types/User.md)

#### Example

## Query

```gql
query legacyBlockedAuthors {
  legacyBlockedAuthors {
    about
    avatar
    banned
    blockedFromOptingInModsAt
    collectionCount
    contributedModCount
    country
    deleted
    donationsEnabled
    dpOptedIn
    email
    endorsementsGiven
    fullPageNotificationCount
    hasGivenKudos
    imageCount
    ipAddress
    isBlocked
    isTracked
    joined
    kudos
    lastActive
    legacyRoles
    memberId
    membershipRoles
    modAnalyticsByMonth {
      ...ModAnalyticsByMonthPageFragment
    }
    modAnalyticsForMonth {
      ...ModAnalyticsForMonthPageFragment
    }
    modCount
    moderationHistoryCount
    moderationJwt
    modsBlockedFromEarningDp {
      ...BlockedModsPageFragment
    }
    name
    ownedModCount
    paypal
    posts
    recognizedAuthor
    roles
    showActivityFeed
    showLastActive
    uniqueModDownloads
    usernameLastChangedAt
    videoCount
    viewerHasBlocked
    viewerHasIgnored
    views
  }
}
```

## Response

```json
{
  "data": {
    "legacyBlockedAuthors": [
      {
        "about": "xyz789",
        "avatar": "abc123",
        "banned": false,
        "blockedFromOptingInModsAt": "2007-12-03T10:15:30Z",
        "collectionCount": 987,
        "contributedModCount": 987,
        "country": "abc123",
        "deleted": true,
        "donationsEnabled": true,
        "dpOptedIn": true,
        "email": "abc123",
        "endorsementsGiven": 987,
        "fullPageNotificationCount": 987,
        "hasGivenKudos": false,
        "imageCount": 123,
        "ipAddress": "abc123",
        "isBlocked": true,
        "isTracked": false,
        "joined": "2007-12-03T10:15:30Z",
        "kudos": 987,
        "lastActive": "2007-12-03T10:15:30Z",
        "legacyRoles": ["xyz789"],
        "memberId": 987,
        "membershipRoles": ["abc123"],
        "modAnalyticsByMonth": ModAnalyticsByMonthPage,
        "modAnalyticsForMonth": ModAnalyticsForMonthPage,
        "modCount": 987,
        "moderationHistoryCount": 123,
        "moderationJwt": "xyz789",
        "modsBlockedFromEarningDp": BlockedModsPage,
        "name": "abc123",
        "ownedModCount": 123,
        "paypal": "xyz789",
        "posts": 123,
        "recognizedAuthor": true,
        "roles": ["abc123"],
        "showActivityFeed": false,
        "showLastActive": true,
        "uniqueModDownloads": 987,
        "usernameLastChangedAt": "2007-12-03T10:15:30Z",
        "videoCount": 123,
        "viewerHasBlocked": false,
        "viewerHasIgnored": false,
        "views": 123
      }
    ]
  }
}
```
