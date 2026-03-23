import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { noAuthGuard } from './guards/no-auth.guard';

const routes: Routes = [
  {
    path: 'login',
    loadChildren: () => import('./login/login.module').then(m => m.LoginPageModule),
    canMatch: [noAuthGuard],
  },
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then(m => m.HomePageModule),
    canMatch: [authGuard],
  },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.module').then(m => m.AdminPageModule),
    canMatch: [authGuard],
  },
  {
    path: 'stories/add',
    loadChildren: () => import('./add-story/add-story.module').then(m => m.AddStoryPageModule),
    canMatch: [authGuard],
  },
  {
    path: 'stories/upload-episode',
    loadChildren: () => import('./upload-episode/upload-episode.module').then(m => m.UploadEpisodePageModule),
    canMatch: [authGuard],
  },
  {
    path: 'audio/:id',
    loadChildren: () => import('./audio-story/audio-story.module').then(m => m.AudioStoryPageModule),
    canMatch: [authGuard],
  },
  {
    path: 'story/:id',
    loadChildren: () => import('./story/story.module').then(m => m.StoryPageModule),
    canMatch: [authGuard],
  },
  {
    path: 'profile',
    loadChildren: () => import('./profile/profile.module').then(m => m.ProfilePageModule),
    canMatch: [authGuard],
  },
  {
    path: 'users',
    loadChildren: () => import('./users/users.module').then(m => m.UsersPageModule),
    canMatch: [authGuard],
  },
  {
    path: 'subscription',
    loadChildren: () => import('./subscription/subscription.module').then(m => m.SubscriptionPageModule),
    canMatch: [authGuard],
  },
  {
    path: 'downloads',
    loadChildren: () => import('./downloads/downloads.module').then(m => m.DownloadsPageModule),
    canMatch: [authGuard],
  },
  {
    path: 'help-center',
    loadChildren: () => import('./help-center/help-center.module').then(m => m.HelpCenterPageModule),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  { path: '**', redirectTo: 'home' },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
