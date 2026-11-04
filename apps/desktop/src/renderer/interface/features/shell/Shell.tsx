import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { ChannelSidebar } from '../channels/ChannelSidebar';
import { UserPanel } from '../channels/UserPanel';
import { HomeSidebar } from '../home/HomeSidebar';
import { FriendsView } from '../home/FriendsView';
import { DiscoverView } from '../discover/DiscoverView';
import { VoiceDock } from '../voice/VoiceDock';
import { SidePanelHost } from '../panels/SidePanelHost';
import { StageHost } from '../voice/StageHost';
import { ServerRail } from './ServerRail';
import { Titlebar } from './Titlebar';

export function Shell() {
  const view = useUiStore((s) => s.view);
  return (
    <div className="shell">
      <Titlebar />
      <div className="shell-body">
        <ServerRail />
        <div className="sidebar-column">
          {view.kind === 'guild' ? <ChannelSidebar guildId={view.guildId} /> : <HomeSidebar />}
          <VoiceDock />
          <UserPanel />
        </div>
        <main className="stage">
          {view.kind === 'discover' ? (
            <DiscoverView />
          ) : view.kind === 'home' && !view.channelId ? (
            <FriendsView />
          ) : view.channelId ? (
            <StageHost channelId={view.channelId} />
          ) : (
            <div className="stage-empty" />
          )}
        </main>
        <SidePanelHost />
      </div>
    </div>
  );
}
