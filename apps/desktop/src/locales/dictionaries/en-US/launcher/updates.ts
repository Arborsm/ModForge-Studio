import type { LauncherUpdatesCopy } from '../../../model/launcher'

const updates: LauncherUpdatesCopy = {
  title: 'Mod Updates',
  subtitle: 'Compare installed mods against Nexus pages derived from UpdateKeys.',
  empty: 'No updates are currently available for installed mods with supported Nexus UpdateKeys.',
  selectionSummary: (selected, total) => `${selected} of ${total} updates selected`,
  availableCount: (count) => `(${count} available updates)`,
  toggleSelection: (allSelected) => (allSelected ? 'Clear All' : 'Select All'),
  recheck: 'Recheck',
  updateSelected: 'Update All Selected',
  updateOne: 'Update This Item',
  expandDetails: 'Expand Details',
  viewChangelog: 'Changelog',
  fetchDetails: 'Fetch Details',
  fetchChangelog: 'Fetch Changelog',
  openHomepage: 'Open Mod Page',
  openComments: 'View Comments',
  overviewTitle: 'Release Overview',
  releaseLabel: 'Released',
  sizeLabel: 'File Size',
  detailsLoading: 'Loading mod details...',
  detailsEmpty: 'Click Fetch Details to load the summary, author, and source information.',
  changelogTitle: (version) => (version ? `Changelog (${version.startsWith('v') ? version : `v${version}`})` : 'Changelog'),
  changelogLoading: 'Loading changelog...',
  changelogEmpty: 'No release notes were published for this version.',
  fetchDetailNotice: 'Fetching mod details',
  fetchChangelogNotice: 'Fetching changelog',
  releaseUnknown: 'Release date unavailable',
  releasedHoursAgo: (hours) => `Released ${hours}h ago`,
  releasedDaysAgo: (days) => `Released ${days} days ago`,
  releasedDate: (dateLabel) => dateLabel,
  releaseDateLocale: 'en-US',
  releaseDateMonthFormat: 'short',
  sizeUnknown: 'Size unavailable',
  checkingProgressTitle: 'Checking mod updates',
  checkingProgressDetail: (checked, total, currentModName) =>
    currentModName
      ? `Checking ${currentModName} (${checked}/${total || '?'})`
      : total > 0
        ? `Checked ${checked}/${total} mods`
        : 'Preparing installed mods',
  checkFailedTitle: 'Failed to Check Mod Updates',
  checkFailedDetail: 'This check did not complete. Try again; detailed diagnostics are shown in notifications.',
  issueLabel: 'Issue',
  diagnosticsAction: 'Open Route Diagnostics',
  detailsExpandAction: 'Expand Details',
  detailsCollapseAction: 'Collapse Details',
  copyLogsAction: 'Copy Log',
  blockedTitle: 'Automatic Update Checks Are Paused',
  blockedDetail:
    'The update routes failed repeatedly, so automatic background checks are paused to avoid sending the same failing requests over and over.',
}

export default updates
