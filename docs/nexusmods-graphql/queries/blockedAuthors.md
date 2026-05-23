# blockedAuthors

                   This endpoint will be replaced with ignored_users

## Description

Get a list of the current user's ignored users.

## Response

Returns [[User!]](../types/User.md)

#### Example

## Query

```gql
query blockedAuthors {
  blockedAuthors {
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
    "blockedAuthors": [
      {
        "about": "xyz789",
        "avatar": "abc123",
        "banned": true,
        "blockedFromOptingInModsAt": "2007-12-03T10:15:30Z",
        "collectionCount": 987,
        "contributedModCount": 123,
        "country": "abc123",
        "deleted": false,
        "donationsEnabled": false,
        "dpOptedIn": false,
        "email": "xyz789",
        "endorsementsGiven": 987,
        "fullPageNotificationCount": 987,
        "hasGivenKudos": false,
        "imageCount": 987,
        "ipAddress": "abc123",
        "isBlocked": false,
        "isTracked": false,
        "joined": "2007-12-03T10:15:30Z",
        "kudos": 987,
        "lastActive": "2007-12-03T10:15:30Z",
        "legacyRoles": ["abc123"],
        "memberId": 987,
        "membershipRoles": ["xyz789"],
        "modAnalyticsByMonth": ModAnalyticsByMonthPage,
        "modAnalyticsForMonth": ModAnalyticsForMonthPage,
        "modCount": 123,
        "moderationHistoryCount": 123,
        "moderationJwt": "abc123",
        "modsBlockedFromEarningDp": BlockedModsPage,
        "name": "abc123",
        "ownedModCount": 123,
        "paypal": "abc123",
        "posts": 987,
        "recognizedAuthor": false,
        "roles": ["xyz789"],
        "showActivityFeed": true,
        "showLastActive": false,
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
