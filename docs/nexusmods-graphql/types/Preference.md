# Preference

## Description

A user preference

## Fields

| Field Name | Description |
| --- | --- |
| `adult` - [Boolean!](../types/Boolean.md) | Show adult content |
| `adultBlurImages` - [Boolean!](../types/Boolean.md) | Blur adult images |
| `bubbleReply` - [Boolean!](../types/Boolean.md) | Replies to posts bump original post |
| `comments` - [PreferencesCommentsEnum!](../types/PreferencesCommentsEnum.md) | Amount of comments per page. |
| `defaultMediaTab` - [PreferencesDefaultMediaTabEnum!](../types/PreferencesDefaultMediaTabEnum.md) | Default media tab. |
| `defaultMediaTabTimeRange` - [PreferencesTimeRangeEnum!](../types/PreferencesTimeRangeEnum.md) | Time range values for preferences. |
| `defaultModsTab` - [PreferencesDefaultModsTabEnum!](../types/PreferencesDefaultModsTabEnum.md) | Default mods tab. |
| `defaultModsTabTimeRange` - [PreferencesTimeRangeEnum!](../types/PreferencesTimeRangeEnum.md) | Time range values for preferences. |
| `defaultOrder` - [PreferencesDefaultSortEnum!](../types/PreferencesDefaultSortEnum.md) | Default sorting option. |
| `defaultSearchType` - [PreferencesSearchTypeEnum!](../types/PreferencesSearchTypeEnum.md) | Default search types |
| `defaultSearchView` - [PreferencesDefaultSearchViewEnum!](../types/PreferencesDefaultSearchViewEnum.md) | Default search view. |
| `disableProfileActivity` - [Boolean!](../types/Boolean.md) | Display user activity |
| `displayLastActivity` - [Boolean!](../types/Boolean.md) | Display when user was last active |
| `dlLocation` - [PreferencesDlLocationEnum!](../types/PreferencesDlLocationEnum.md) | Download location. |
| `download` - [PreferencesDownloadMethodEnum!](../types/PreferencesDownloadMethodEnum.md) | Preferred download method |
| `id` - [ID!](../types/ID.md) | ID of the object. |
| `imageShowcase` - [PreferencesImageShowcaseEnum!](../types/PreferencesImageShowcaseEnum.md) | Image showcase. |
| `isBlockingContent` - [Boolean!](../types/Boolean.md) | If true, this user is blocking content |
| `marketingEmails` - [Boolean!](../types/Boolean.md) | Whether the user has opted in to marketing emails |
| `notificationsActive` - [Boolean!](../types/Boolean.md) | Display notifications |
| `notificationsGameSpecific` - [Boolean!](../types/Boolean.md) | Game specific notifications when visiting game pages |
| `reminder` - [PreferencesReminderEnum!](../types/PreferencesReminderEnum.md) | Endorsement reminder. |
| `results` - [PreferencesResultsEnum!](../types/PreferencesResultsEnum.md) | Amount of results per page. |
| `subfeedsActivityTracked` - [Boolean!](../types/Boolean.md) | Activity about tracked files, images and videos |
| `subfeedsActivityYour` - [Boolean!](../types/Boolean.md) | Activity about a users files, images and videos |
| `subfeedsAuthorTracked` - [Boolean!](../types/Boolean.md) | Author tracked files, images and videos |
| `subfeedsCommentsTracked` - [Boolean!](../types/Boolean.md) | Comments about tracked files, images and videos |
| `subfeedsCommentsYour` - [Boolean!](../types/Boolean.md) | Comments about a users files, images and videos |

## Example

```json
{
  "adult": true,
  "adultBlurImages": true,
  "bubbleReply": true,
  "comments": "COMMENTS_10",
  "defaultMediaTab": "NEW",
  "defaultMediaTabTimeRange": "ALL_TIME",
  "defaultModsTab": "NEW",
  "defaultModsTabTimeRange": "ALL_TIME",
  "defaultOrder": "BY_RECENT_FILES",
  "defaultSearchType": "ALL_CONTENT",
  "defaultSearchView": "STANDARD",
  "disableProfileActivity": false,
  "displayLastActivity": false,
  "dlLocation": "NEXUS_CDN",
  "download": "POP_UP_BOX",
  "id": 4,
  "imageShowcase": "NOT_SET",
  "isBlockingContent": true,
  "marketingEmails": false,
  "notificationsActive": true,
  "notificationsGameSpecific": false,
  "reminder": "NEVER",
  "results": "RESULTS_20",
  "subfeedsActivityTracked": false,
  "subfeedsActivityYour": false,
  "subfeedsAuthorTracked": true,
  "subfeedsCommentsTracked": true,
  "subfeedsCommentsYour": true
}
```
