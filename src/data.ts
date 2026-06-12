/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client, MonthlyPackage, Activity, User } from './types';

export const SEED_USERS: User[] = [
  {
    id: 'u1',
    name: 'Sarah Jenkins',
    email: 'admin@agency.com',
    role: 'Admin',
    created_at: '2025-01-01T00:00:00Z'
  },
  {
    id: 'u2',
    name: 'Alex Rivera',
    email: 'manager@agency.com',
    role: 'Manager',
    created_at: '2025-01-01T00:00:00Z'
  }
];

export const SEED_CLIENTS: Client[] = [
  {
    id: 'c1',
    client_name: 'ABC Hospital',
    logo_url: 'H',
    industry: 'Healthcare & Wellness',
    start_date: '2025-01-10',
    status: 'Active',
    created_at: '2025-01-10T08:00:00Z',
    priority: 'High'
  },
  {
    id: 'c2',
    client_name: 'Apex Fitness Centre',
    logo_url: 'F',
    industry: 'Fitness & Sports',
    start_date: '2025-03-01',
    status: 'Active',
    created_at: '2025-03-01T09:00:00Z',
    priority: 'Medium'
  },
  {
    id: 'c3',
    client_name: 'Bloom Florist',
    logo_url: 'B',
    industry: 'E-commerce & Retail',
    start_date: '2025-11-15',
    status: 'Active',
    created_at: '2025-11-15T10:00:00Z',
    priority: 'Low'
  },
  {
    id: 'c4',
    client_name: 'Nexus Tech Solutions',
    logo_url: 'N',
    industry: 'SaaS & Enterprise',
    start_date: '2024-06-01',
    status: 'Paused',
    created_at: '2024-06-01T08:00:00Z',
    priority: 'Medium'
  },
  {
    id: 'c5',
    client_name: 'Zenith Law Firm',
    logo_url: 'Z',
    industry: 'Legal Services',
    start_date: '2024-02-01',
    status: 'Closed',
    created_at: '2024-02-01T11:00:00Z',
    priority: 'Low'
  }
];

export const SEED_PACKAGES: MonthlyPackage[] = [
  {
    id: 'p1',
    client_id: 'c1',
    month: 6, // June
    year: 2026,
    posters_target: 20,
    reels_target: 8,
    video_target: 4,
    ads_target: 2,
    blogs_target: 4,
    content_target: 5,
    scripts_target: 6,
    website_updates_target: 3,
    created_at: '2026-06-01T00:00:00Z'
  },
  {
    id: 'p2',
    client_id: 'c2',
    month: 6, // June
    year: 2026,
    posters_target: 15,
    reels_target: 12,
    video_target: 2,
    ads_target: 1,
    blogs_target: 2,
    content_target: 4,
    scripts_target: 2,
    website_updates_target: 1,
    created_at: '2026-06-01T00:00:00Z'
  },
  {
    id: 'p3',
    client_id: 'c3',
    month: 6, // June
    year: 2026,
    posters_target: 10,
    reels_target: 6,
    video_target: 1,
    ads_target: 2,
    blogs_target: 1,
    content_target: 2,
    scripts_target: 3,
    website_updates_target: 1,
    created_at: '2026-06-01T00:00:00Z'
  },
  {
    id: 'p4',
    client_id: 'c4',
    month: 6, // June
    year: 2026,
    posters_target: 5,
    reels_target: 2,
    video_target: 1,
    ads_target: 1,
    blogs_target: 2,
    content_target: 2,
    scripts_target: 2,
    website_updates_target: 1,
    created_at: '2026-06-01T00:00:00Z'
  }
];

export const SEED_ACTIVITIES: Activity[] = [
  // --- ABC Hospital (c1) Activities ---
  // Posters target: 20, Completed: 18, Intermediate: 1
  ...Array.from({ length: 18 }, (_, i) => ({
    id: `act-c1-poster-${i}`,
    client_id: 'c1',
    activity_type: 'Poster' as const,
    stage: 'Uploaded',
    title: `Weekly Health Tip Infographic #${i + 1}`,
    description: `Created and uploaded custom social media poster about healthcare tips and prevention guidelines.`,
    drive_link: `https://drive.google.com/file/d/abc_hospital_poster_${i}_link`,
    activity_date: `2026-06-0${(i % 7) + 1}`,
    created_by: 'Alex Rivera',
    remarks: 'Approved by clinical head.',
    created_at: `2026-06-0${(i % 7) + 1}T10:00:00Z`
  })),
  {
    id: 'act-c1-poster-draft',
    client_id: 'c1',
    activity_type: 'Poster',
    stage: 'Designed', // Intermediate
    title: 'New Emergency Ward Poster Draft',
    description: 'Awaiting copy confirmation from client before uploading.',
    drive_link: 'https://drive.google.com/drive/folders/c1-posters-draft',
    activity_date: '2026-06-08',
    created_by: 'Alex Rivera',
    remarks: 'Pending text edit.',
    created_at: '2026-06-08T09:00:00Z'
  },
  // Reels target: 8, Completed: 6, Intermediate: 1
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `act-c1-reel-${i}`,
    client_id: 'c1',
    activity_type: 'Reel' as const,
    stage: 'Uploaded',
    title: `Physiotherapy Drills Reels Short Video #${i + 1}`,
    description: `Shot on site, post-edited with graphics and voice over, uploaded to Instagram.`,
    drive_link: `https://drive.google.com/file/d/abc_hospital_reel_${i}_link`,
    activity_date: `2026-06-0${(i % 5) + 1}`,
    created_by: 'Alex Rivera',
    remarks: 'Performing extremely well in organic reach.',
    created_at: `2026-06-0${(i % 5) + 1}T14:30:00Z`
  })),
  {
    id: 'act-c1-reel-draft',
    client_id: 'c1',
    activity_type: 'Reel',
    stage: 'Edited', // Intermediate
    title: 'Doctor Q&A Episode 7',
    description: 'Edited raw video files, rendering completed. Scheduling for Friday upload.',
    drive_link: 'https://drive.google.com/file/d/abc_hospital_reel_draft',
    activity_date: '2026-06-07',
    created_by: 'Alex Rivera',
    created_at: '2026-06-07T16:00:00Z'
  },
  // Video Editing target: 4, Completed: 4
  {
    id: 'act-c1-video-1',
    client_id: 'c1',
    activity_type: 'Video Editing',
    stage: 'Delivered',
    title: 'Hospital Walkthrough Virtual Tour',
    description: 'Fully edited 5-minute landscape video highlighting new state-of-the-art facilities.',
    drive_link: 'https://drive.google.com/file/d/abc_hospital_video_1',
    activity_date: '2026-06-02',
    created_by: 'Alex Rivera',
    remarks: 'Shared via client portal.',
    created_at: '2026-06-02T11:00:00Z'
  },
  {
    id: 'act-c1-video-2',
    client_id: 'c1',
    activity_type: 'Video Editing',
    stage: 'Delivered',
    title: 'Cardiology Seminar Recap',
    description: 'Summarized 3-hour seminar into a punchy 10-minute recap video.',
    drive_link: 'https://drive.google.com/file/d/abc_hospital_video_2',
    activity_date: '2026-06-03',
    created_by: 'Alex Rivera',
    remarks: 'Delivered successfully.',
    created_at: '2026-06-03T18:00:00Z'
  },
  {
    id: 'act-c1-video-3',
    client_id: 'c1',
    activity_type: 'Video Editing',
    stage: 'Completed', // Intermediate only, NOT DELIVERED YET so doesn't count towards target
    title: 'Pediatric Care Highlights',
    description: 'Video timeline finalized and color graded. In progress of internal QA review.',
    drive_link: 'https://drive.google.com/file/d/abc_hospital_video_3',
    activity_date: '2026-06-08',
    created_by: 'Alex Rivera',
    remarks: 'Need audio track replacement.',
    created_at: '2026-06-08T11:00:00Z'
  },
  // Blogs target: 4, Completed: 3
  {
    id: 'act-c1-blog-1',
    client_id: 'c1',
    activity_type: 'Blog',
    stage: 'Published',
    title: 'Preventative Hearts Care in 2026',
    description: 'Optimized blog article discussing routine screening guidelines.',
    blog_title: '5 Crucial Cardiac Habits You Should Start Today',
    blog_url: 'https://abchospital.org/blog/cardiac-habits-preventative-care',
    drive_link: 'https://drive.google.com/file/d/abc_hospital_blog_1',
    activity_date: '2026-06-01',
    created_by: 'Alex Rivera',
    created_at: '2026-06-01T09:00:00Z'
  },
  {
    id: 'act-c1-blog-2',
    client_id: 'c1',
    activity_type: 'Blog',
    stage: 'Published',
    title: 'Understanding Pediatric Vaccines',
    description: 'Thoroughly researched guide addressing common parent vaccine questions.',
    blog_title: 'Unraveling the Pediatric Vaccination Schedule',
    blog_url: 'https://abchospital.org/blog/pediatric-vaccines-schedule',
    drive_link: 'https://drive.google.com/file/d/abc_hospital_blog_2',
    activity_date: '2026-06-04',
    created_by: 'Alex Rivera',
    created_at: '2026-06-04T10:30:00Z'
  },
  {
    id: 'act-c1-blog-3',
    client_id: 'c1',
    activity_type: 'Blog',
    stage: 'Published',
    title: 'Recognizing Seasonal Allergies',
    description: 'Short informational blog matching search intentions for early summer allergy trends.',
    blog_title: 'Summer Allergies: Prevention and Relieving Tips',
    blog_url: 'https://abchospital.org/blog/summer-allergies-relief',
    drive_link: 'https://drive.google.com/file/d/abc_hospital_blog_3',
    activity_date: '2026-06-06',
    created_by: 'Alex Rivera',
    created_at: '2026-06-06T15:00:00Z'
  },
  {
    id: 'act-c1-blog-4',
    client_id: 'c1',
    activity_type: 'Blog',
    stage: 'Submitted', // Intermediate only, NOT PUBLISHED YET
    title: 'Role of Nutrition in Healing',
    description: 'Draft completed and submitted to clinical nutritionist team for endorsement.',
    drive_link: 'https://drive.google.com/file/d/abc_hospital_blog_4_draft',
    activity_date: '2026-06-08',
    created_by: 'Alex Rivera',
    created_at: '2026-06-08T12:00:00Z'
  },
  // Content writing: target 5, completed 4
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `act-c1-content-${i}`,
    client_id: 'c1',
    activity_type: 'Content Writing' as const,
    stage: 'Published',
    title: `Monthly Patient Press Release Vol ${i + 1}`,
    description: `Formal update copy about specialized surgeries and hospital achievements.`,
    drive_link: `https://drive.google.com/file/d/abc_hospital_content_${i}`,
    activity_date: `2026-06-0${i + 2}`,
    created_by: 'Alex Rivera',
    created_at: `2026-06-0${i + 2}T12:00:00Z`
  })),
  // Website updates: target 3, completed: 2
  {
    id: 'act-c1-web-1',
    client_id: 'c1',
    activity_type: 'Website Update',
    sub_type: 'Website Activity',
    stage: 'Completed',
    title: 'Homepage Hero Banner Updated',
    description: 'Refreshed homepage image banner showcasing the new outpatient wing launch with proper call to action links.',
    drive_link: 'https://drive.google.com/file/d/abc_hospital_web_1',
    activity_date: '2026-06-02',
    created_by: 'Alex Rivera',
    created_at: '2026-06-02T13:00:00Z'
  },
  {
    id: 'act-c1-web-2',
    client_id: 'c1',
    activity_type: 'Website Update',
    sub_type: 'Website Activity',
    stage: 'Completed',
    title: 'Find A Doctor Interactive Form Fixed',
    description: 'Patched bug on the WordPress landing page database search query that caused physician dropdown menus to hang on mobile devices.',
    drive_link: 'https://github.com/agency-operations/abc-hospital-web-form-fix',
    activity_date: '2026-06-05',
    created_by: 'Alex Rivera',
    created_at: '2026-06-05T14:45:00Z'
  },


  // --- Apex Fitness Centre (c2) Activities ---
  // Posters target: 15, Completed: 11, Intermediate: 2
  ...Array.from({ length: 11 }, (_, i) => ({
    id: `act-c2-poster-${i}`,
    client_id: 'c2',
    activity_type: 'Poster' as const,
    stage: 'Uploaded',
    title: `Apex Summer Challenge Promo Poster #${i + 1}`,
    description: `Branded high-contrast social media design supporting summer fitness challenge packages.`,
    drive_link: `https://drive.google.com/file/d/apex_fitness_poster_${i}_link`,
    activity_date: `2026-06-0${(i % 6) + 1}`,
    created_by: 'Alex Rivera',
    created_at: `2026-06-0${(i % 6) + 1}T11:00:00Z`
  })),
  // Reels target: 12, Completed: 10, Intermediate: 1
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `act-c2-reel-${i}`,
    client_id: 'c2',
    activity_type: 'Reel' as const,
    stage: 'Uploaded',
    title: `Heavy Lift Motivation short video #${i + 1}`,
    description: `Featuring client trainers demonstrating gym techniques. Text overlays on reels.`,
    drive_link: `https://drive.google.com/file/d/apex_fitness_reel_${i}_link`,
    activity_date: `2026-06-0${(i % 5) + 1}`,
    created_by: 'Alex Rivera',
    created_at: `2026-06-0${(i % 5) + 1}T16:30:00Z`
  })),
  // Video target: 2, Completed: 2
  {
    id: 'act-c2-video-1',
    client_id: 'c2',
    activity_type: 'Video Editing',
    stage: 'Delivered',
    title: 'Apex Gym Promo Trailer (60s)',
    description: 'Cinematic promotional horizontal video clip optimized for YouTube and Website hero embed.',
    drive_link: 'https://drive.google.com/file/d/apex_gym_video_1',
    activity_date: '2026-06-03',
    created_by: 'Alex Rivera',
    created_at: '2026-06-03T09:00:00Z'
  },
  {
    id: 'act-c2-video-2',
    client_id: 'c2',
    activity_type: 'Video Editing',
    stage: 'Delivered',
    title: 'Core Strength Kettlebell Class Guide',
    description: 'Step-by-step 15 min tutorial edited and prepared for members-only video stream library.',
    drive_link: 'https://drive.google.com/file/d/apex_gym_video_2',
    activity_date: '2026-06-06',
    created_by: 'Alex Rivera',
    created_at: '2026-06-06T15:30:00Z'
  },
  // Ads target: 1, Completed: 1
  {
    id: 'act-c2-ad-1',
    client_id: 'c2',
    activity_type: 'Ad Campaign',
    stage: 'Launched',
    title: 'Meta June Membership Lead Generation Ad',
    description: 'Created custom lookalike audience targeting local radius for discount sign-ups.',
    drive_link: 'https://adsmanager.facebook.com/apex_fitness_june_ad_set_01',
    activity_date: '2026-06-01',
    created_by: 'Alex Rivera',
    remarks: 'Averages $1.82 per high-intent lead.',
    created_at: '2026-06-01T10:00:00Z'
  },
  // Websites target: 1, Completed: 1
  {
    id: 'act-c2-web-1',
    client_id: 'c2',
    activity_type: 'Website Update',
    sub_type: 'Website Activity',
    stage: 'Completed',
    title: 'Summer Class Schedule HTML Update',
    description: 'Refreshed calendar listing page on WordPress with new timetables for Pilates and Kettlebells.',
    drive_link: 'https://drive.google.com/file/d/apex_fitness_web_refresh_1',
    activity_date: '2026-06-04',
    created_by: 'Alex Rivera',
    created_at: '2026-06-04T12:00:00Z'
  },


  // --- Bloom Florist (c3) Activities ---
  // Bloom Florist has lower stats purposefully to showcase the "Behind Target Section" which flags any active client below 80% completion in bright red.
  // Posters target: 10, Completed: 5, Intermediate: 1
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `act-c3-poster-${i}`,
    client_id: 'c3',
    activity_type: 'Poster' as const,
    stage: 'Uploaded',
    title: `Rose Bouquet Bridal Collection Graphic #${i + 1}`,
    description: `Esthetic Instagram feed design showcasing wedding flower offerings.`,
    drive_link: `https://drive.google.com/file/d/bloom_florist_poster_${i}_link`,
    activity_date: `2026-06-0${(i % 4) + 1}`,
    created_by: 'Alex Rivera',
    created_at: `2026-06-0${(i % 4) + 1}T12:00:00Z`
  })),
  // Reels target: 6, Completed: 2, Intermediate: 0
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `act-c3-reel-${i}`,
    client_id: 'c3',
    activity_type: 'Reel' as const,
    stage: 'Uploaded',
    title: `Assembling Custom Floral Garland Reels Short Video #${i + 1}`,
    description: `Time-lapse style edited clip showing intricate bouquet creation.`,
    drive_link: `https://drive.google.com/file/d/bloom_florist_reel_${i}_link`,
    activity_date: `2026-06-0${(i % 2) + 2}`,
    created_by: 'Alex Rivera',
    created_at: `2026-06-0${(i % 2) + 2}T15:00:00Z`
  })),
  // Content writing target: 2, Completed: 1
  {
    id: 'act-c3-content-1',
    client_id: 'c3',
    activity_type: 'Content Writing',
    stage: 'Published',
    title: 'Newsletter Blast Content: Father\'s Day Special',
    description: 'Email newsletter layout copywriting highlighting special flower baskets and chocolates.',
    drive_link: 'https://drive.google.com/file/d/bloom_florist_ fathers_day_newsletter',
    activity_date: '2026-06-03',
    created_by: 'Alex Rivera',
    created_at: '2026-06-03T11:00:00Z'
  },
  // Websites target: 1, Completed: 0, Intermediate: 0
  {
    id: 'act-c3-ad-1',
    client_id: 'c3',
    activity_type: 'Ad Campaign',
    stage: 'Created', // Intermediate only, NOT LAUNCHED so doesn't count
    title: 'Father\'s Day Meta Retargeting Ad Design',
    description: 'Configuring pixel retargeting logic for wedding collection abandon-cart users.',
    drive_link: 'https://drive.google.com/file/d/bloom_florist_ad_draft',
    activity_date: '2026-06-08',
    created_by: 'Alex Rivera',
    created_at: '2026-06-08T14:00:00Z'
  }
];
