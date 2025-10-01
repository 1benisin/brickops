# Requirements

## Functional

**FR1:** The system shall provide mobile camera and webcam integration for instant Lego part recognition using Brickognize API with 95%+ accuracy for common parts

**FR2:** The system shall maintain a comprehensive centralized Lego catalog database with part numbers, descriptions, images, colors, LEGO element IDs, and market pricing data

**FR3:** The system shall bootstrap catalog reference data (parts, colors, categories, element codes) from Bricklink XML exports stored in the repository before enabling live API syncs

**FR4:** The system shall implement intelligent catalog passthrough functionality that fetches missing or stale records from Bricklink API when not found in the BrickOps catalog database

**FR5:** The system shall provide real-time inventory tracking with location-based organization and quantity management

**FR6:** The system shall track inventory status (available, sold, reserved) with quantity splits for each status

**FR7:** The system shall maintain comprehensive audit trail for all inventory changes with timestamps and user attribution

**FR8:** The system shall integrate with both Bricklink and Brickowl APIs for automated order import and inventory adjustment

**FR9:** The system shall provide bidirectional data synchronization with both Bricklink and Brickowl to maintain inventory consistency

**FR10:** The system shall implement intelligent API rate limiting to respect Bricklink, Brickowl, and Brickognize API constraints

**FR11:** The system shall provide search and filter functionality for parts by part number, sort grid/bin location, keyword/description, or visual search

**FR12:** The system shall process orders from both Bricklink and Brickowl and automatically adjust inventory quantities accordingly

**FR13:** The system shall provide basic reporting functionality to view inventory levels and recent changes

**FR14:** The system shall implement secure user authentication using Convex auth

**FR15:** The system shall provide real-time updates across all connected clients using Convex subscriptions

**FR16:** The system shall provide optimized pick path generation for single or multiple orders based on inventory locations

**FR17:** The system shall provide comprehensive issue resolution tools during picking including inventory search and location-based part management

**FR18:** The system shall maintain a TODO list for parts that cannot be fulfilled, requiring customer refunds or resolution

**FR19:** The system shall enforce catalog freshness windows (fresh <7 days, stale <30 days, expired ≥30 days) and schedule refresh jobs to keep data up to date

**FR20:** The system shall display sorting grid/bin locations (e.g., C303) showing where parts should be located in physical inventory, sourced from the BrickOps `bin_lookup_v3.json` dataset and kept in sync with catalog records

**FR21:** The system shall allow inventory level adjustments during picking that automatically sync to Bricklink as ground truth

**FR22:** The system shall support multi-user accounts with multiple users per business account

**FR23:** The system shall provide role-based access control with different permission levels for account users

**FR24:** The system shall allow account owners to invite, manage, and remove users from their account

**FR25:** The system shall maintain data isolation between different business accounts while allowing shared access within accounts

## Non Functional

**NFR1:** The system shall maintain <3 second page load times and <1 second API response times for optimal user experience

**NFR2:** The system shall achieve 99.9% uptime to ensure reliable service availability

**NFR3:** The system shall respect Bricklink and Brickowl API rate limits while maintaining <5 second response times for catalog lookups

**NFR4:** The system shall implement intelligent caching to minimize API calls while ensuring data freshness

**NFR5:** The system shall support modern browsers (Chrome, Firefox, Safari, Edge) on both desktop and mobile devices

**NFR6:** The system shall maintain data encryption at rest and in transit for security compliance

**NFR7:** The system shall implement GDPR compliance for user data protection

**NFR8:** The system shall achieve 95%+ accuracy for Lego part identification using Brickognize API

**NFR9:** The system shall maintain 99%+ successful sync rate across marketplace integrations

**NFR10:** The system shall support 1,000+ concurrent users without performance degradation

**NFR11:** The system shall enforce role-based access control with secure user session management and data isolation between business accounts
