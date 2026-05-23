# ignoredUsers

## Description

Get a list of the current user's ignored users.

## Response

Returns [[User!]](../types/User.md)

#### Example

## Query

```gql
query ignoredUsers {
  ignoredUsers {
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
    "ignoredUsers": [
      {
        "about": "abc123",
        "avatar": "abc123",
        "banned": false,
        "blockedFromOptingInModsAt": "2007-12-03T10:15:30Z",
        "collectionCount": 123,
        "contributedModCount": 123,
        "country": "xyz789",
        "deleted": true,
        "donationsEnabled": false,
        "dpOptedIn": true,
        "email": "abc123",
        "endorsementsGiven": 987,
        "fullPageNotificationCount": 123,
        "hasGivenKudos": true,
        "imageCount": 987,
        "ipAddress": "xyz789",
        "isBlocked": false,
        "isTracked": true,
        "joined": "2007-12-03T10:15:30Z",
        "kudos": 123,
        "lastActive": "2007-12-03T10:15:30Z",
        "legacyRoles": ["abc123"],
        "memberId": 987,
        "membershipRoles": ["abc123"],
        "modAnalyticsByMonth": ModAnalyticsByMonthPage,
        "modAnalyticsForMonth": ModAnalyticsForMonthPage,
        "modCount": 123,
        "moderationHistoryCount": 123,
        "moderationJwt": "xyz789",
        "modsBlockedFromEarningDp": BlockedModsPage,
        "name": "abc123",
        "ownedModCount": 987,
        "paypal": "xyz789",
        "posts": 987,
        "recognizedAuthor": false,
        "roles": ["xyz789"],
        "showActivityFeed": true,
        "showLastActive": true,
        "uniqueModDownloads": 123,
        "usernameLastChangedAt": "2007-12-03T10:15:30Z",
        "videoCount": 987,
        "viewerHasBlocked": true,
        "viewerHasIgnored": true,
        "views": 123
      }
    ]
  }
}
```
