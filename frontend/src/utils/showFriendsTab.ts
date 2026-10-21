// Opens the friends list (not the add-friend search) on the Friends tab.
// Loaded lazily: the chat store imports the friends store, which shows friend alerts.
export const showFriendsTab = () =>
  import('@/store/useChatStore').then(({ useChatStore }) =>
    useChatStore.setState({ activeTab: 'friends', friendsView: 'list', selectedUser: null }),
  );
