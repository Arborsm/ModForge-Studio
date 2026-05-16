# user

## Description

Get user by id

## Response

Returns a [User](../types/User.md)

## Arguments

| Name | Description |
| --- | --- |
| `id` - [Int!](../types/Int.md) | User ID of user to find |

#### Example

## Query

```gql
query user($id: Int!) {
  user(id: $id) {
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

## Variables

```json
{"id": 987}
```

## Response

```json
{
  "data": {
    "user": {
      "about": "abc123",
      "avatar": "xyz789",
      "banned": true,
      "blockedFromOptingInModsAt": "2007-12-03T10:15:30Z",
      "collectionCount": 123,
      "contributedModCount": 123,
      "country": "xyz789",
      "deleted": false,
      "donationsEnabled": true,
      "dpOptedIn": false,
      "email": "abc123",
      "endorsementsGiven": 987,
      "fullPageNotificationCount": 123,
      "hasGivenKudos": true,
      "imageCount": 123,
      "ipAddress": "abc123",
      "isBlocked": true,
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
      "moderationHistoryCount": 987,
      "moderationJwt": "abc123",
      "modsBlockedFromEarningDp": BlockedModsPage,
      "name": "xyz789",
      "ownedModCount": 987,
      "paypal": "xyz789",
      "posts": 123,
      "recognizedAuthor": true,
      "roles": ["xyz789"],
      "showActivityFeed": true,
      "showLastActive": false,
      "uniqueModDownloads": 987,
      "usernameLastChangedAt": "2007-12-03T10:15:30Z",
      "videoCount": 123,
      "viewerHasBlocked": true,
      "viewerHasIgnored": false,
      "views": 123
    }
  }
}
```
